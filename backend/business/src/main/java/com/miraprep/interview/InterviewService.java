package com.miraprep.interview;

import com.miraprep.auth.AuthTokenStore;
import com.miraprep.auth.RequestRateLimiter;
import com.miraprep.client.AiServiceClient;
import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import com.miraprep.domain.GradingStatus;
import com.miraprep.domain.InterviewDifficulty;
import com.miraprep.domain.InterviewMessage;
import com.miraprep.domain.InterviewPhase;
import com.miraprep.domain.InterviewSession;
import com.miraprep.domain.InterviewSessionType;
import com.miraprep.domain.InterviewStatus;
import com.miraprep.domain.InterviewerStyle;
import com.miraprep.domain.MessageRole;
import com.miraprep.domain.OutlineStatus;
import com.miraprep.domain.Question;
import com.miraprep.domain.Resume;
import com.miraprep.interview.dto.AppendQuestionRequest;
import com.miraprep.interview.dto.AppendQuestionResponse;
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
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InterviewService {
    private static final Logger LOGGER = LoggerFactory.getLogger(InterviewService.class);
    /** 面试可能比设定时长拖一会儿（迟到进入、追问），令牌多留一小时。 */
    private static final Duration RUNTIME_TOKEN_SLACK = Duration.ofHours(1);
    private static final SecureRandom RUNTIME_TOKEN_RANDOM = new SecureRandom();
    private final InterviewSessionRepository interviewSessionRepository;
    private final QuestionRepository questionRepository;
    private final InterviewMessageRepository interviewMessageRepository;
    private final ResumeRepository resumeRepository;
    private final ReportRepository reportRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final AuthTokenStore runtimeTokenStore;
    private final RequestRateLimiter rateLimiter;
    private final Duration createWindow;
    private final int createMaxAttempts;

    public InterviewService(
            InterviewSessionRepository interviewSessionRepository,
            QuestionRepository questionRepository,
            InterviewMessageRepository interviewMessageRepository,
            ResumeRepository resumeRepository,
            ReportRepository reportRepository,
            ApplicationEventPublisher eventPublisher,
            AuthTokenStore runtimeTokenStore,
            RequestRateLimiter rateLimiter,
            @Value("${app.interview.create-window}") long createWindowSeconds,
            @Value("${app.interview.create-max-attempts}") int createMaxAttempts) {
        this.interviewSessionRepository = interviewSessionRepository;
        this.questionRepository = questionRepository;
        this.interviewMessageRepository = interviewMessageRepository;
        this.resumeRepository = resumeRepository;
        this.reportRepository = reportRepository;
        this.eventPublisher = eventPublisher;
        this.runtimeTokenStore = runtimeTokenStore;
        this.rateLimiter = rateLimiter;
        this.createWindow = Duration.ofSeconds(createWindowSeconds);
        this.createMaxAttempts = createMaxAttempts;
    }

    @Transactional
    public CreateInterviewResponse create(Long userId, String clientIp, CreateInterviewRequest request) {
        Resume resume = resumeRepository.findById(request.resumeId())
                .filter(candidate -> !candidate.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!resume.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        if (!rateLimiter.tryAcquire(
                "interview:create:" + clientIp + ':' + userId, createMaxAttempts, createWindow)) {
            throw new BusinessException(ErrorCode.RATE_LIMITED);
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

        // 令牌在创建时就铸好交给前端，大纲就绪后才交接给运行时，两边必须是同一个值。
        String runtimeToken = issueRuntimeToken(saved);
        return new CreateInterviewResponse(
                saved.getId(), lower(saved.getOutlineStatus()), runtimeToken);
    }

    private static String runtimeTokenKey(Long sessionId) {
        return "interview:runtime-token:" + sessionId;
    }

    private static String newRuntimeToken() {
        byte[] material = new byte[32];
        RUNTIME_TOKEN_RANDOM.nextBytes(material);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(material);
    }

    /** 为同一业务边界内的正式面试或单题练习铸造运行时令牌。 */
    String issueRuntimeToken(InterviewSession session) {
        String runtimeToken = newRuntimeToken();
        runtimeTokenStore.put(
                runtimeTokenKey(session.getId()),
                runtimeToken,
                Duration.ofMinutes(session.getDurationMin()).plus(RUNTIME_TOKEN_SLACK));
        return runtimeToken;
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
        runtimeTokenStore.delete(runtimeTokenKey(session.getId()));
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
            case "timeout", "completed", "practice_completed" -> InterviewStatus.COMPLETED;
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
            sessions = interviewSessionRepository.findByUserIdAndDeletedFalseAndSessionType(
                    userId, InterviewSessionType.INTERVIEW, pageable);
        } else {
            sessions = interviewSessionRepository.findByUserIdAndDeletedFalseAndSessionTypeAndStatus(
                    userId,
                    InterviewSessionType.INTERVIEW,
                    enumValue(com.miraprep.domain.InterviewStatus.class, status),
                    pageable);
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
        List<Question> saved = questionRepository.saveAll(questions);
        session.setOutlineStatus(OutlineStatus.READY);
        publishRuntimeStart(session, saved, "interview");
    }

    /**
     * 把创建时铸好的会话令牌与出题上下文交接给运行时。令牌缺失（过期或服务重启前创建）
     * 时只记日志：会话仍是 READY，用户重新创建一场即可，不该让回调失败。
     */
    void publishRuntimeStart(
            InterviewSession session, List<Question> questions, String mode) {
        String runtimeToken = runtimeTokenStore.get(runtimeTokenKey(session.getId()));
        if (runtimeToken == null) {
            LOGGER.warn(
                    "Runtime token missing for interview {}, skipping runtime handoff",
                    session.getId());
            return;
        }
        Resume resume = session.getResume();
        List<AiServiceClient.InterviewStartQuestion> startQuestions = questions.stream()
                .sorted(Comparator.comparing(Question::getSortOrder))
                .map(question -> new AiServiceClient.InterviewStartQuestion(
                        question.getId(),
                        question.getPhase().name(),
                        question.getText(),
                        question.getFocusPoints() == null ? List.of() : question.getFocusPoints(),
                        question.getSortOrder()))
                .toList();
        eventPublisher.publishEvent(new InterviewRuntimeStartRequestedEvent(
                new AiServiceClient.InterviewStartRequest(
                        session.getId(),
                        mode,
                        runtimeToken,
                        session.getDurationMin(),
                        lower(session.getInterviewerStyle()),
                        new AiServiceClient.InterviewOutlineConfig(
                                session.getJobDirection(),
                                session.getJobTitle(),
                                session.getJdText(),
                                lower(session.getDifficulty()),
                                session.getTypes(),
                                session.getDurationMin(),
                                session.getCustomRequirements(),
                                lower(session.getInterviewerStyle())),
                        new AiServiceClient.InterviewOutlineResume(
                                resume == null || resume.getParsedJson() == null
                                        ? Map.of()
                                        : resume.getParsedJson()),
                        startQuestions)));
    }

    /** 运行时现场出题后落库，返回 questionId 供消息与批改引用。 */
    @Transactional
    public AppendQuestionResponse appendQuestion(Long sessionId, AppendQuestionRequest request) {
        InterviewSession session = interviewSessionRepository.findByIdForUpdate(sessionId)
                .filter(candidate -> !candidate.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (session.getStatus() == InterviewStatus.COMPLETED
                || session.getStatus() == InterviewStatus.ABORTED) {
            throw new BusinessException(ErrorCode.INVALID_PARAM);
        }
        InterviewPhase phase = enumValue(InterviewPhase.class, request.phase());
        if (phase == InterviewPhase.GREETING) {
            throw new BusinessException(ErrorCode.INVALID_PARAM);
        }

        Question question = new Question();
        question.setSession(session);
        question.setPhase(phase);
        question.setText(request.text().trim());
        question.setFocusPoints(List.copyOf(request.focusPoints()));
        question.setSortOrder((int) questionRepository.countBySessionId(sessionId) + 1);
        question.setSuggestedSeconds(request.suggestedSeconds());
        Question saved = questionRepository.save(question);
        return new AppendQuestionResponse(saved.getId(), saved.getSortOrder());
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
            InterviewMessage primaryQuestion = messages.stream()
                    .filter(message -> message.getRole() == MessageRole.INTERVIEWER)
                    .filter(message -> message.getSeq() < primaryAnswer.getSeq())
                    .max(java.util.Comparator.comparingInt(InterviewMessage::getSeq))
                    .orElse(null);
            question.setThinkSeconds(0);
            question.setAnswerSeconds(elapsedSeconds(primaryQuestion, primaryAnswer));
            transcript.add(new AiServiceClient.InterviewGradeTranscriptQuestion(
                    question.getId(),
                    lower(question.getPhase()),
                    question.getFocusPoints() == null ? List.of() : question.getFocusPoints(),
                    question.getText(),
                    primaryAnswer.getContent(),
                    followUps(messages, primaryAnswer.getSeq())));
        }
        questionRepository.saveAll(questions);

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
            pair.put("answerSeconds", elapsedSeconds(interviewer, answer));
            followUps.add(pair);
            lastAnswerSeq = answer.getSeq();
        }
        return List.copyOf(followUps);
    }

    private int elapsedSeconds(InterviewMessage question, InterviewMessage answer) {
        if (question == null
                || question.getCreatedAt() == null
                || answer.getCreatedAt() == null
                || answer.getCreatedAt().isBefore(question.getCreatedAt())) {
            return 0;
        }
        long seconds = Duration.between(question.getCreatedAt(), answer.getCreatedAt()).getSeconds();
        return (int) Math.min(seconds, Integer.MAX_VALUE);
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
