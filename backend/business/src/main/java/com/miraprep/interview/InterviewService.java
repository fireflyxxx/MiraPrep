package com.miraprep.interview;

import com.miraprep.client.AiServiceClient;
import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import com.miraprep.domain.InterviewDifficulty;
import com.miraprep.domain.InterviewPhase;
import com.miraprep.domain.InterviewSession;
import com.miraprep.domain.InterviewStatus;
import com.miraprep.domain.GradingStatus;
import com.miraprep.domain.OutlineStatus;
import com.miraprep.domain.InterviewerStyle;
import com.miraprep.domain.Question;
import com.miraprep.domain.Resume;
import com.miraprep.interview.dto.CreateInterviewRequest;
import com.miraprep.interview.dto.CreateInterviewResponse;
import com.miraprep.interview.dto.EndInterviewRequest;
import com.miraprep.interview.dto.EndInterviewResponse;
import com.miraprep.interview.dto.InterviewListResponse;
import com.miraprep.interview.dto.InterviewListItemResponse;
import com.miraprep.interview.dto.InterviewStatusResponse;
import com.miraprep.interview.dto.OutlineResultRequest;
import com.miraprep.interview.dto.OutlineQuestionRequest;
import com.miraprep.resume.ResumeRepository;
import java.util.Comparator;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InterviewService {
    private static final Logger LOGGER = LoggerFactory.getLogger(InterviewService.class);
    private final InterviewSessionRepository interviewSessionRepository;
    private final QuestionRepository questionRepository;
    private final ResumeRepository resumeRepository;
    private final ApplicationEventPublisher eventPublisher;

    public InterviewService(
            InterviewSessionRepository interviewSessionRepository,
            QuestionRepository questionRepository,
            ResumeRepository resumeRepository,
            ApplicationEventPublisher eventPublisher) {
        this.interviewSessionRepository = interviewSessionRepository;
        this.questionRepository = questionRepository;
        this.resumeRepository = resumeRepository;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public CreateInterviewResponse create(Long userId, CreateInterviewRequest request) {
        Resume resume = resumeRepository.findById(request.resumeId())
                .filter(candidate -> !candidate.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!resume.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }

        InterviewDifficulty difficulty = enumValue(InterviewDifficulty.class, request.difficulty());
        InterviewerStyle interviewerStyle = enumValue(InterviewerStyle.class, request.interviewerStyle());
        InterviewSession session = new InterviewSession();
        session.setUser(resume.getUser());
        session.setResume(resume);
        session.setJobDirection(request.jobDirection().trim());
        session.setJobTitle(optionalText(request.jobTitle(), session.getJobDirection()));
        session.setJdText(optionalText(request.jdText(), null));
        session.setDifficulty(difficulty);
        session.setTypes(List.copyOf(request.types()));
        session.setDurationMin(request.durationMin());
        session.setCustomRequirements(optionalText(request.customRequirements(), null));
        session.setInterviewerStyle(interviewerStyle);
        session.setVoiceEnabled(request.voiceEnabled());
        InterviewSession saved = interviewSessionRepository.save(session);

        AiServiceClient.InterviewOutlineRequest outlineRequest = new AiServiceClient.InterviewOutlineRequest(
                saved.getId(),
                new AiServiceClient.InterviewOutlineConfig(
                        saved.getJobDirection(),
                        saved.getJobTitle(),
                        saved.getJdText(),
                        lower(saved.getDifficulty()),
                        saved.getTypes(),
                        saved.getDurationMin(),
                        saved.getCustomRequirements(),
                        lower(saved.getInterviewerStyle())),
                new AiServiceClient.InterviewOutlineResume(
                        resume.getParsedJson() == null ? Map.of() : resume.getParsedJson()));
        eventPublisher.publishEvent(new InterviewOutlineRequestedEvent(outlineRequest));
        return new CreateInterviewResponse(saved.getId(), lower(saved.getOutlineStatus()));
    }

    @Transactional(readOnly = true)
    public InterviewStatusResponse status(Long userId, Long sessionId) {
        InterviewSession session = ownedSession(userId, sessionId);
        return new InterviewStatusResponse(
                session.getId(),
                lower(session.getStatus()),
                lower(session.getOutlineStatus()),
                questionRepository.countBySessionId(sessionId));
    }

    @Transactional
    public EndInterviewResponse end(Long userId, Long sessionId, EndInterviewRequest request) {
        String reason = request.reason().trim().toLowerCase(Locale.ROOT);
        InterviewStatus targetStatus = switch (reason) {
            case "manual" -> InterviewStatus.ABORTED;
            case "timeout", "completed" -> InterviewStatus.COMPLETED;
            default -> throw new BusinessException(ErrorCode.INVALID_PARAM);
        };

        InterviewSession session = interviewSessionRepository.findByIdForUpdate(sessionId)
                .filter(candidate -> !candidate.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!session.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        if (session.getStatus() == InterviewStatus.COMPLETED
                || session.getStatus() == InterviewStatus.ABORTED) {
            return endResponse(session);
        }

        session.setStatus(targetStatus);
        session.setEndedAt(Instant.now());
        session.setGradingStatus(GradingStatus.PENDING);
        eventPublisher.publishEvent(new InterviewGradingRequestedEvent(session.getId()));
        return endResponse(session);
    }

    @Transactional(readOnly = true)
    public InterviewListResponse list(Long userId, int page, int size, String status) {
        PageRequest pageable = PageRequest.of(
                page - 1, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<InterviewSession> sessions;
        if (status == null || status.isBlank()) {
            sessions = interviewSessionRepository.findByUserIdAndDeletedFalse(userId, pageable);
        } else {
            sessions = interviewSessionRepository.findByUserIdAndDeletedFalseAndStatus(
                    userId, enumValue(com.miraprep.domain.InterviewStatus.class, status), pageable);
        }

        List<Long> sessionIds = sessions.getContent().stream().map(InterviewSession::getId).toList();
        Map<Long, Long> questionCounts = questionCounts(sessionIds);
        List<InterviewListItemResponse> items = sessions.getContent().stream()
                .map(session -> listItem(session, questionCounts.getOrDefault(session.getId(), 0L)))
                .toList();
        return new InterviewListResponse(items, sessions.getTotalElements(), page, size);
    }

    @Transactional
    public void applyOutlineResult(Long sessionId, OutlineResultRequest request) {
        InterviewSession session = interviewSessionRepository.findByIdForUpdate(sessionId)
                .filter(candidate -> !candidate.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (session.getOutlineStatus() != OutlineStatus.PENDING) {
            return;
        }

        String callbackStatus = request.status().trim().toLowerCase(Locale.ROOT);
        if ("failed".equals(callbackStatus)) {
            LOGGER.warn("Outline generation failed for interview {}: {}", sessionId, request.error());
            session.setOutlineStatus(OutlineStatus.FAILED);
            return;
        }
        if (!"ready".equals(callbackStatus) || request.questions() == null || request.questions().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAM);
        }

        var orders = new HashSet<Integer>();
        for (OutlineQuestionRequest question : request.questions()) {
            if (!orders.add(question.order())) {
                throw new BusinessException(ErrorCode.INVALID_PARAM);
            }
        }
        List<Question> questions;
        try {
            questions = request.questions().stream()
                    .sorted(Comparator.comparing(OutlineQuestionRequest::order))
                    .map(requestQuestion -> toQuestion(session, requestQuestion))
                    .toList();
        } catch (BusinessException exception) {
            LOGGER.warn("Outline generation returned an unsupported phase for interview {}", sessionId);
            session.setOutlineStatus(OutlineStatus.FAILED);
            return;
        }
        questionRepository.saveAll(questions);
        session.setOutlineStatus(OutlineStatus.READY);
    }

    private Question toQuestion(InterviewSession session, OutlineQuestionRequest request) {
        InterviewPhase phase = enumValue(InterviewPhase.class, request.phase());
        if (phase == InterviewPhase.GREETING) {
            throw new BusinessException(ErrorCode.INVALID_PARAM);
        }
        Question question = new Question();
        question.setSession(session);
        question.setPhase(phase);
        question.setText(request.text().trim());
        question.setFocusPoints(request.focusPoints() == null ? List.of() : List.copyOf(request.focusPoints()));
        question.setSortOrder(request.order());
        question.setSuggestedSeconds(request.suggestedSeconds());
        return question;
    }

    private Map<Long, Long> questionCounts(List<Long> sessionIds) {
        if (sessionIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, Long> counts = new HashMap<>();
        for (Object[] row : questionRepository.countBySessionIds(sessionIds)) {
            counts.put((Long) row[0], (Long) row[1]);
        }
        return counts;
    }

    private InterviewListItemResponse listItem(InterviewSession session, long questionCount) {
        Long actualDurationSeconds = session.getStartedAt() == null || session.getEndedAt() == null
                ? null
                : Duration.between(session.getStartedAt(), session.getEndedAt()).getSeconds();
        return new InterviewListItemResponse(
                session.getId(),
                session.getJobTitle(),
                lower(session.getDifficulty()),
                session.getDurationMin(),
                actualDurationSeconds,
                questionCount,
                lower(session.getStatus()),
                null,
                reportStatus(session),
                session.getCreatedAt(),
                session.getEndedAt());
    }

    private EndInterviewResponse endResponse(InterviewSession session) {
        return new EndInterviewResponse(
                session.getId(), lower(session.getStatus()), reportStatus(session), session.getEndedAt());
    }

    private String reportStatus(InterviewSession session) {
        return switch (session.getGradingStatus()) {
            case NONE -> "none";
            case PENDING -> "grading";
            case READY -> "ready";
            case FAILED -> "failed";
        };
    }

    private InterviewSession ownedSession(Long userId, Long sessionId) {
        InterviewSession session = interviewSessionRepository.findByIdAndDeletedFalse(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!session.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return session;
    }

    private <E extends Enum<E>> E enumValue(Class<E> type, String value) {
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.INVALID_PARAM);
        }
    }

    private String optionalText(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private String lower(Enum<?> value) {
        return value.name().toLowerCase(Locale.ROOT);
    }
}
