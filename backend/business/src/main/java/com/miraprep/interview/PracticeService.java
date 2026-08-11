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
import com.miraprep.domain.Question;
import com.miraprep.domain.QuestionReview;
import com.miraprep.domain.Report;
import com.miraprep.interview.dto.CreatePracticeResponse;
import com.miraprep.interview.dto.PracticeResultResponse;
import com.miraprep.report.QuestionReviewRepository;
import com.miraprep.report.ReportRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
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
        boolean reviewed = reviewRepository.findByReportId(sourceReport.getId()).stream()
                .map(QuestionReview::getQuestion)
                .anyMatch(question -> question.getId().equals(sourceQuestionId));
        if (!reviewed) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        // 每次重练都会拉起一个运行时并最终触发一次批改，和创建面试一样需要配额兜底。
        // ponytail: 复用面试创建的窗口与次数配置，单独计桶；练习真要独立阈值时再加配置项。
        if (!rateLimiter.tryAcquire(
                "practice:create:" + userId, createMaxAttempts, createWindow)) {
            throw new BusinessException(ErrorCode.RATE_LIMITED);
        }

        InterviewSession practice = copySession(source);
        practice = sessionRepository.save(practice);
        Question practiceQuestion = cloneQuestion(practice, sourceQuestion);
        practiceQuestion = questionRepository.save(practiceQuestion);

        PracticeSession metadata = new PracticeSession();
        metadata.setSession(practice);
        metadata.setSourceSession(source);
        metadata.setSourceQuestion(sourceQuestion);
        practiceRepository.save(metadata);

        String runtimeToken = interviewService.issueRuntimeToken(practice);
        interviewService.publishRuntimeStart(practice, List.of(practiceQuestion), "practice");
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
        String questionText = metadata.getSourceQuestion().getText();
        if (!"ready".equals(status)) {
            return new PracticeResultResponse(status, questionText, null, null, null);
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

        PracticeResultResponse.Attempt sourceAttempt = attempt(
                metadata.getSourceSession().getId(), sourceQuestion, sourceReview);
        PracticeResultResponse.Attempt currentAttempt =
                attempt(practiceSessionId, currentQuestion, currentReview);
        return new PracticeResultResponse(
                "ready",
                questionText,
                sourceAttempt,
                currentAttempt,
                currentReview.getScore().subtract(sourceReview.getScore()));
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
                review.getSuggestions() == null ? List.of() : List.copyOf(review.getSuggestions()));
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

    private Question cloneQuestion(InterviewSession practice, Question source) {
        Question question = new Question();
        question.setSession(practice);
        question.setPhase(source.getPhase());
        question.setText(source.getText());
        question.setFocusPoints(
                source.getFocusPoints() == null ? List.of() : List.copyOf(source.getFocusPoints()));
        question.setSortOrder(1);
        question.setSuggestedSeconds(source.getSuggestedSeconds());
        return question;
    }
}
