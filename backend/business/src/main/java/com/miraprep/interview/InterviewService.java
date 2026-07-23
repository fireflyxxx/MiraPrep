package com.miraprep.interview;

import com.miraprep.client.AiServiceClient;
import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import com.miraprep.domain.GradingStatus;
import com.miraprep.domain.InterviewDifficulty;
import com.miraprep.domain.InterviewMessage;
import com.miraprep.domain.InterviewPhase;
import com.miraprep.domain.InterviewSession;
import com.miraprep.domain.InterviewStatus;
import com.miraprep.domain.InterviewerStyle;
import com.miraprep.domain.MessageRole;
import com.miraprep.domain.OutlineStatus;
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
import com.miraprep.interview.dto.RuntimeGradingRequest;
import com.miraprep.resume.ResumeRepository;
import com.miraprep.report.ReportRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InterviewService {
    private static final Logger LOGGER = LoggerFactory.getLogger(InterviewService.class);
    private final InterviewSessionRepository interviewSessionRepository;
    private final QuestionRepository questionRepository;
    private final InterviewMessageRepository interviewMessageRepository;
    private final ResumeRepository resumeRepository;
    private final ReportRepository reportRepository;
    private final ApplicationEventPublisher eventPublisher;

    public InterviewService(
            InterviewSessionRepository interviewSessionRepository,
            QuestionRepository questionRepository,
            InterviewMessageRepository interviewMessageRepository,
            ResumeRepository resumeRepository,
            ReportRepository reportRepository,
            ApplicationEventPublisher eventPublisher) {
        this.interviewSessionRepository = interviewSessionRepository;
        this.questionRepository = questionRepository;
        this.interviewMessageRepository = interviewMessageRepository;
        this.resumeRepository = resumeRepository;
        this.reportRepository = reportRepository;
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
        scheduleGrading(session);
        return endResponse(session);
    }

    @Transactional
    public void requestGradingFromRuntime(Long sessionId, RuntimeGradingRequest request) {
        InterviewSession session = interviewSessionRepository
                .findByIdForUpdate(sessionId)
                .filter(candidate -> !candidate.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (session.getGradingStatus() == GradingStatus.PENDING
                || session.getGradingStatus() == GradingStatus.READY) {
            return;
        }

        InterviewStatus runtimeStatus = switch (request.reason().trim().toLowerCase(Locale.ROOT)) {
            case "manual", "inappropriate_content" -> InterviewStatus.ABORTED;
            case "timeout", "completed" -> InterviewStatus.COMPLETED;
            default -> throw new BusinessException(ErrorCode.INVALID_PARAM);
        };
        if (session.getStatus() != InterviewStatus.ABORTED) {
            session.setStatus(runtimeStatus);
        }
        if (session.getEndedAt() == null) {
            session.setEndedAt(Instant.now());
        }
        scheduleGrading(session);
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
        Map<Long, String> grades = new HashMap<>();
        if (!sessionIds.isEmpty()) {
            reportRepository.findBySessionIdIn(sessionIds).forEach(
                    report -> grades.put(report.getSession().getId(), report.getGrade().name()));
        }
        List<InterviewListItemResponse> items = sessions.getContent().stream()
                .map(session -> listItem(
                        session,
                        questionCounts.getOrDefault(session.getId(), 0L),
                        grades.get(session.getId())))
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

    private void scheduleGrading(InterviewSession session) {
        AiServiceClient.InterviewGradeRequest request = gradingRequest(session);
        if (request.transcript().isEmpty()) {
            session.setGradingStatus(GradingStatus.FAILED);
            session.setGradingError("NO_ANSWERED_QUESTIONS");
            return;
        }
        session.setGradingStatus(GradingStatus.PENDING);
        session.setGradingError(null);
        eventPublisher.publishEvent(new InterviewGradingRequestedEvent(request));
    }

    private AiServiceClient.InterviewGradeRequest gradingRequest(InterviewSession session) {
        List<Question> questions =
                questionRepository.findBySessionIdOrderBySortOrder(session.getId());
        Map<Long, List<InterviewMessage>> messagesByQuestion = new HashMap<>();
        for (InterviewMessage message :
                interviewMessageRepository.findBySessionIdOrderBySeqAsc(session.getId())) {
            if (message.getQuestion() != null) {
                messagesByQuestion
                        .computeIfAbsent(message.getQuestion().getId(), ignored -> new ArrayList<>())
                        .add(message);
            }
        }

        List<AiServiceClient.InterviewGradeTranscriptQuestion> transcript = new ArrayList<>();
        for (Question question : questions) {
            List<InterviewMessage> messages =
                    messagesByQuestion.getOrDefault(question.getId(), List.of());
            InterviewMessage primaryAnswer = messages.stream()
                    .filter(message -> message.getRole() == MessageRole.CANDIDATE)
                    .findFirst()
                    .orElse(null);
            if (primaryAnswer == null) {
                continue;
            }
            transcript.add(new AiServiceClient.InterviewGradeTranscriptQuestion(
                    question.getId(),
                    lower(question.getPhase()),
                    question.getFocusPoints() == null ? List.of() : question.getFocusPoints(),
                    question.getText(),
                    primaryAnswer.getContent(),
                    followUps(messages, primaryAnswer.getSeq())));
        }

        Resume resume = session.getResume();
        Map<String, Object> parsedResume =
                resume == null || resume.getParsedJson() == null ? Map.of() : resume.getParsedJson();
        return new AiServiceClient.InterviewGradeRequest(
                session.getId(),
                new AiServiceClient.InterviewOutlineConfig(
                        session.getJobDirection(),
                        session.getJobTitle(),
                        session.getJdText(),
                        lower(session.getDifficulty()),
                        session.getTypes(),
                        session.getDurationMin(),
                        session.getCustomRequirements(),
                        lower(session.getInterviewerStyle())),
                new AiServiceClient.InterviewOutlineResume(parsedResume),
                List.copyOf(transcript),
                session.getStatus() == InterviewStatus.ABORTED);
    }

    private List<Map<String, Object>> followUps(
            List<InterviewMessage> messages, int primaryAnswerSeq) {
        List<Map<String, Object>> followUps = new ArrayList<>();
        int lastAnswerSeq = primaryAnswerSeq;
        for (InterviewMessage interviewer : messages) {
            if (interviewer.getRole() != MessageRole.INTERVIEWER
                    || interviewer.getSeq() <= primaryAnswerSeq) {
                continue;
            }
            InterviewMessage answer = null;
            for (InterviewMessage candidate : messages) {
                if (candidate.getRole() == MessageRole.CANDIDATE
                        && candidate.getSeq() > interviewer.getSeq()
                        && candidate.getSeq() > lastAnswerSeq) {
                    answer = candidate;
                    break;
                }
            }
            if (answer == null) {
                continue;
            }
            Map<String, Object> pair = new LinkedHashMap<>();
            pair.put("question", interviewer.getContent());
            pair.put("answer", answer.getContent());
            followUps.add(pair);
            lastAnswerSeq = answer.getSeq();
        }
        return List.copyOf(followUps);
    }

    private InterviewListItemResponse listItem(
            InterviewSession session, long questionCount, String grade) {
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
                grade,
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
