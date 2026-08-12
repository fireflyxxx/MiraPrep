package com.miraprep.interview;

import com.miraprep.auth.RequestRateLimiter;
import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import com.miraprep.domain.GradingStatus;
import com.miraprep.domain.InterviewSession;
import com.miraprep.domain.InterviewSessionType;
import com.miraprep.domain.InterviewStatus;
import com.miraprep.domain.InterviewMessage;
import com.miraprep.domain.MessageRole;
import com.miraprep.domain.OutlineStatus;
import com.miraprep.domain.PracticeSession;
import com.miraprep.domain.PracticeTargetType;
import com.miraprep.domain.Question;
import com.miraprep.domain.QuestionReview;
import com.miraprep.domain.Report;
import com.miraprep.interview.dto.CreatePracticeRequest;
import com.miraprep.interview.dto.CreatePracticeResponse;
import com.miraprep.interview.dto.PracticeResultResponse;
import com.miraprep.report.QuestionReviewRepository;
import com.miraprep.report.ReportRepository;
import java.time.Duration;
import java.time.Instant;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PracticeService {
    private static final int PRACTICE_DURATION_MINUTES = 15;

    private final InterviewSessionRepository sessionRepository;
    private final QuestionRepository questionRepository;
    private final InterviewMessageRepository messageRepository;
    private final ReportRepository reportRepository;
    private final QuestionReviewRepository reviewRepository;
    private final PracticeSessionRepository practiceRepository;
    private final InterviewService interviewService;
    private final RequestRateLimiter rateLimiter;
    private final Duration createWindow;
    private final int createMaxAttempts;

    public PracticeService(
            InterviewSessionRepository sessionRepository,
            QuestionRepository questionRepository,
            InterviewMessageRepository messageRepository,
            ReportRepository reportRepository,
            QuestionReviewRepository reviewRepository,
            PracticeSessionRepository practiceRepository,
            InterviewService interviewService,
            RequestRateLimiter rateLimiter,
            @Value("${app.interview.create-window}") long createWindowSeconds,
            @Value("${app.interview.create-max-attempts}") int createMaxAttempts) {
        this.sessionRepository = sessionRepository;
        this.questionRepository = questionRepository;
        this.messageRepository = messageRepository;
        this.reportRepository = reportRepository;
        this.reviewRepository = reviewRepository;
        this.practiceRepository = practiceRepository;
        this.interviewService = interviewService;
        this.rateLimiter = rateLimiter;
        this.createWindow = Duration.ofSeconds(createWindowSeconds);
        this.createMaxAttempts = createMaxAttempts;
    }

    @Transactional
    public CreatePracticeResponse create(Long userId, Long sourceSessionId, Long sourceQuestionId) {
        return create(userId, sourceSessionId, sourceQuestionId, CreatePracticeRequest.mainQuestion());
    }

    @Transactional
    public CreatePracticeResponse create(
            Long userId,
            Long sourceSessionId,
            Long sourceQuestionId,
            CreatePracticeRequest request) {
        InterviewSession source = sessionRepository
                .findByIdAndDeletedFalse(sourceSessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!source.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        if (source.getSessionType() != InterviewSessionType.INTERVIEW) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        Question sourceQuestion = questionRepository
                .findByIdAndSessionId(sourceQuestionId, sourceSessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        Report sourceReport = reportRepository
                .findBySessionId(sourceSessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        QuestionReview sourceReview = reviewRepository
                .findByReportIdAndQuestionId(sourceReport.getId(), sourceQuestionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        PracticeTargetType targetType = request == null || request.targetType() == null
                ? PracticeTargetType.MAIN_QUESTION
                : request.targetType();
        SourceAttempt sourceAttempt = targetType == PracticeTargetType.MAIN_QUESTION
                ? mainAttempt(sourceSessionId, sourceQuestion, sourceReview)
                : followUpAttempt(sourceReview, request.followUpIndex());
        // 每次重练都会拉起一个运行时并最终触发一次批改，和创建面试一样需要配额兜底。
        // ponytail: 复用面试创建的窗口与次数配置，单独计桶；练习真要独立阈值时再加配置项。
        if (!rateLimiter.tryAcquire(
                "practice:create:" + userId, createMaxAttempts, createWindow)) {
            throw new BusinessException(ErrorCode.RATE_LIMITED);
        }

        InterviewSession practice = copySession(source);
        practice = sessionRepository.save(practice);
        Question practiceQuestion = cloneQuestion(practice, sourceQuestion, sourceAttempt.prompt());
        practiceQuestion = questionRepository.save(practiceQuestion);

        PracticeSession metadata = new PracticeSession();
        metadata.setSession(practice);
        metadata.setSourceSession(source);
        metadata.setSourceQuestion(sourceQuestion);
        metadata.setTargetType(targetType);
        metadata.setSourceFollowUpIndex(
                targetType == PracticeTargetType.FOLLOW_UP ? request.followUpIndex() : null);
        metadata.setSourcePrompt(sourceAttempt.prompt());
        metadata.setSourceAnswer(sourceAttempt.answer());
        metadata.setSourceScore(sourceAttempt.score());
        metadata.setSourceReferenceAnswer(sourceAttempt.referenceAnswer());
        metadata.setSourceSuggestions(sourceAttempt.suggestions());
        metadata.setSourceFollowUps(sourceAttempt.followUps());
        practiceRepository.save(metadata);

        String runtimeToken = interviewService.issueRuntimeToken(practice);
        interviewService.publishRuntimeStart(
                practice,
                List.of(practiceQuestion),
                "practice",
                targetType == PracticeTargetType.MAIN_QUESTION ? "main_question" : "follow_up");
        return new CreatePracticeResponse(practice.getId(), runtimeToken);
    }

    @Transactional(readOnly = true)
    public PracticeResultResponse result(Long userId, Long practiceSessionId) {
        PracticeSession metadata = practiceRepository
                .findById(practiceSessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        InterviewSession practice = metadata.getSession();
        if (practice.isDeleted()) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        if (!practice.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }

        String status = switch (practice.getGradingStatus()) {
            case READY -> "ready";
            case FAILED -> "failed";
            case NONE, PENDING -> "grading";
        };
        String questionText = metadata.getSourcePrompt() == null
                ? metadata.getSourceQuestion().getText()
                : metadata.getSourcePrompt();
        PracticeTargetType targetType = metadata.getTargetType() == null
                ? PracticeTargetType.MAIN_QUESTION
                : metadata.getTargetType();
        if (!"ready".equals(status)) {
            return new PracticeResultResponse(
                    status,
                    targetType.name(),
                    metadata.getSourceFollowUpIndex(),
                    questionText,
                    null,
                    null,
                    null,
                    null);
        }

        Report sourceReport = reportRepository
                .findBySessionId(metadata.getSourceSession().getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        Report currentReport = reportRepository
                .findBySessionId(practiceSessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        Question sourceQuestion = metadata.getSourceQuestion();
        Question currentQuestion = questionRepository
                .findBySessionIdOrderBySortOrder(practiceSessionId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        QuestionReview sourceReview = reviewRepository
                .findByReportIdAndQuestionId(sourceReport.getId(), sourceQuestion.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        QuestionReview currentReview = reviewRepository
                .findByReportIdAndQuestionId(currentReport.getId(), currentQuestion.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));

        PracticeResultResponse.Attempt sourceAttempt = metadata.getSourceAnswer() == null
                ? attempt(metadata.getSourceSession().getId(), sourceQuestion, sourceReview)
                : new PracticeResultResponse.Attempt(
                        metadata.getSourceAnswer(),
                        metadata.getSourceScore() == null
                                ? currentReview.getBaselineScore()
                                : metadata.getSourceScore(),
                        metadata.getSourceReferenceAnswer(),
                        metadata.getSourceSuggestions() == null
                                ? List.of()
                                : List.copyOf(metadata.getSourceSuggestions()),
                        targetType == PracticeTargetType.MAIN_QUESTION
                                ? snapshotFollowUps(metadata, sourceReview)
                                : List.of());
        PracticeResultResponse.Attempt currentAttempt =
                attempt(practiceSessionId, currentQuestion, currentReview);
        return new PracticeResultResponse(
                "ready",
                targetType.name(),
                metadata.getSourceFollowUpIndex(),
                questionText,
                sourceAttempt,
                currentAttempt,
                comparison(currentReview),
                sourceAttempt.score() == null
                        ? null
                        : currentReview.getScore().subtract(sourceAttempt.score()));
    }

    private PracticeResultResponse.AnswerComparison comparison(QuestionReview review) {
        Map<String, Object> value = review.getComparisonJson();
        if (value == null) {
            return null;
        }
        return new PracticeResultResponse.AnswerComparison(
                stringList(value.get("improvements")),
                stringList(value.get("remainingGaps")),
                requiredString(value.get("scoreRationale")));
    }

    private PracticeResultResponse.Attempt attempt(
            Long sessionId, Question question, QuestionReview review) {
        String answer = messageRepository
                .findBySessionIdAndRoleOrderBySeqAsc(sessionId, MessageRole.CANDIDATE)
                .stream()
                .filter(message -> sameQuestion(message, question))
                .map(InterviewMessage::getContent)
                .findFirst()
                .orElse(null);
        return new PracticeResultResponse.Attempt(
                answer,
                review.getScore(),
                review.getReferenceAnswer(),
                review.getSuggestions() == null ? List.of() : List.copyOf(review.getSuggestions()),
                followUps(review));
    }

    private List<PracticeResultResponse.FollowUp> followUps(QuestionReview review) {
        return followUps(review.getFollowUpChainJson());
    }

    private List<PracticeResultResponse.FollowUp> snapshotFollowUps(
            PracticeSession metadata, QuestionReview sourceReview) {
        // V8 之前创建的练习没有追问快照，只对这些历史记录回退读取来源报告。
        return metadata.getSourceFollowUps() == null
                ? followUps(sourceReview)
                : followUps(List.copyOf(metadata.getSourceFollowUps()));
    }

    private List<PracticeResultResponse.FollowUp> followUps(List<?> chain) {
        if (chain == null) {
            return List.of();
        }
        return chain.stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(item -> new PracticeResultResponse.FollowUp(
                        requiredString(item.get("question")),
                        requiredString(item.get("answer")),
                        item.get("score") instanceof Number number
                                ? new BigDecimal(number.toString())
                                : null,
                        requiredString(item.get("referenceAnswer")),
                        requiredStringList(item.get("suggestions"))))
                .toList();
    }

    private boolean sameQuestion(InterviewMessage message, Question question) {
        return message.getQuestion() != null && message.getQuestion().getId().equals(question.getId());
    }

    private InterviewSession copySession(InterviewSession source) {
        InterviewSession practice = new InterviewSession();
        practice.setUser(source.getUser());
        practice.setResume(source.getResume());
        practice.setJobDirection(source.getJobDirection());
        practice.setJobTitle(source.getJobTitle());
        practice.setJdText(source.getJdText());
        practice.setDifficulty(source.getDifficulty());
        practice.setTypes(source.getTypes() == null ? List.of() : List.copyOf(source.getTypes()));
        practice.setDurationMin(PRACTICE_DURATION_MINUTES);
        practice.setCustomRequirements(source.getCustomRequirements());
        practice.setInterviewerStyle(source.getInterviewerStyle());
        practice.setVoiceEnabled(source.isVoiceEnabled());
        practice.setSessionType(InterviewSessionType.PRACTICE);
        practice.setStatus(InterviewStatus.ONGOING);
        practice.setOutlineStatus(OutlineStatus.READY);
        practice.setGradingStatus(GradingStatus.NONE);
        practice.setStartedAt(Instant.now());
        return practice;
    }

    private Question cloneQuestion(InterviewSession practice, Question source, String prompt) {
        Question question = new Question();
        question.setSession(practice);
        question.setPhase(source.getPhase());
        question.setText(prompt);
        question.setFocusPoints(
                source.getFocusPoints() == null ? List.of() : List.copyOf(source.getFocusPoints()));
        question.setSortOrder(1);
        question.setSuggestedSeconds(source.getSuggestedSeconds());
        return question;
    }

    private SourceAttempt mainAttempt(
            Long sourceSessionId, Question sourceQuestion, QuestionReview sourceReview) {
        String answer = messageRepository
                .findBySessionIdAndRoleOrderBySeqAsc(sourceSessionId, MessageRole.CANDIDATE)
                .stream()
                .filter(message -> sameQuestion(message, sourceQuestion))
                .map(InterviewMessage::getContent)
                .findFirst()
                .orElse(null);
        return new SourceAttempt(
                sourceQuestion.getText(),
                answer,
                sourceReview.getScore(),
                sourceReview.getReferenceAnswer(),
                sourceReview.getSuggestions() == null
                        ? List.of()
                        : List.copyOf(sourceReview.getSuggestions()),
                sourceFollowUps(sourceReview));
    }

    private SourceAttempt followUpAttempt(QuestionReview sourceReview, Integer followUpIndex) {
        if (followUpIndex == null || followUpIndex < 0) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        List<Object> chain = sourceReview.getFollowUpChainJson();
        if (chain == null || followUpIndex >= chain.size()) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        if (!(chain.get(followUpIndex) instanceof Map<?, ?> item)) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        String prompt = requiredString(item.get("question"));
        String answer = requiredString(item.get("answer"));
        String referenceAnswer = requiredString(item.get("referenceAnswer"));
        List<String> suggestions = requiredStringList(item.get("suggestions"));
        BigDecimal score = item.get("score") instanceof Number number
                ? new BigDecimal(number.toString())
                : null;
        return new SourceAttempt(prompt, answer, score, referenceAnswer, suggestions, List.of());
    }

    private List<Map<String, Object>> sourceFollowUps(QuestionReview review) {
        return followUps(review).stream()
                .map(followUp -> {
                    Map<String, Object> value = new java.util.LinkedHashMap<>();
                    value.put("question", followUp.question());
                    value.put("answer", followUp.answer());
                    if (followUp.score() != null) {
                        value.put("score", followUp.score());
                    }
                    value.put("referenceAnswer", followUp.referenceAnswer());
                    value.put("suggestions", followUp.suggestions());
                    return value;
                })
                .toList();
    }

    private String requiredString(Object value) {
        if (!(value instanceof String text) || text.isBlank()) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        return text.trim();
    }

    private List<String> requiredStringList(Object value) {
        if (!(value instanceof List<?> values) || values.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        List<String> strings = values.stream()
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .map(String::trim)
                .filter(item -> !item.isEmpty())
                .toList();
        if (strings.size() != values.size()) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        return List.copyOf(strings);
    }

    private List<String> stringList(Object value) {
        if (!(value instanceof List<?> values)) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        List<String> strings = values.stream()
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .map(String::trim)
                .filter(item -> !item.isEmpty())
                .toList();
        if (strings.size() != values.size()) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        return List.copyOf(strings);
    }

    private record SourceAttempt(
            String prompt,
            String answer,
            BigDecimal score,
            String referenceAnswer,
            List<String> suggestions,
            List<Map<String, Object>> followUps) {}
}
