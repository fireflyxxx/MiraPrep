package com.miraprep.report;

import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import com.miraprep.domain.GradingStatus;
import com.miraprep.domain.InterviewMessage;
import com.miraprep.domain.InterviewSession;
import com.miraprep.domain.InterviewStatus;
import com.miraprep.domain.MessageRole;
import com.miraprep.domain.Question;
import com.miraprep.domain.QuestionReview;
import com.miraprep.domain.Report;
import com.miraprep.domain.ReportGrade;
import com.miraprep.interview.InterviewMessageRepository;
import com.miraprep.interview.InterviewSessionRepository;
import com.miraprep.interview.QuestionRepository;
import com.miraprep.report.dto.GradeFailedRequest;
import com.miraprep.report.dto.GradeResultRequest;
import com.miraprep.report.dto.ReportResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReportService {
    private static final Logger LOGGER = LoggerFactory.getLogger(ReportService.class);
    private static final int MAX_STORED_ERROR_LENGTH = 500;
    private static final Pattern SECRET_ASSIGNMENT = Pattern.compile(
            "(?i)(api[_-]?key|token|password)\\s*[=:]\\s*[^\\s,;]+");
    private static final Pattern BEARER_SECRET =
            Pattern.compile("(?i)bearer\\s+[^\\s,;]+");

    private final InterviewSessionRepository sessionRepository;
    private final QuestionRepository questionRepository;
    private final InterviewMessageRepository messageRepository;
    private final ReportRepository reportRepository;
    private final QuestionReviewRepository reviewRepository;

    public ReportService(
            InterviewSessionRepository sessionRepository,
            QuestionRepository questionRepository,
            InterviewMessageRepository messageRepository,
            ReportRepository reportRepository,
            QuestionReviewRepository reviewRepository) {
        this.sessionRepository = sessionRepository;
        this.questionRepository = questionRepository;
        this.messageRepository = messageRepository;
        this.reportRepository = reportRepository;
        this.reviewRepository = reviewRepository;
    }

    @Transactional
    public void applyGradeResult(Long sessionId, GradeResultRequest request) {
        InterviewSession session = lockedSession(sessionId);
        if (session.getGradingStatus() == GradingStatus.READY) {
            return;
        }
        if (!gradeForScore(request.totalScore()).equals(request.grade())) {
            throw new BusinessException(ErrorCode.INVALID_PARAM);
        }

        List<Question> questions = questionRepository.findBySessionIdOrderBySortOrder(sessionId);
        Map<Long, Question> questionsById = new HashMap<>();
        for (Question question : questions) {
            questionsById.put(question.getId(), question);
        }
        Set<Long> reviewQuestionIds = new HashSet<>();
        for (GradeResultRequest.QuestionReviewResult result : request.questionReviews()) {
            if (!reviewQuestionIds.add(result.questionId())
                    || !questionsById.containsKey(result.questionId())) {
                throw new BusinessException(ErrorCode.INVALID_PARAM);
            }
        }
        if (!request.partial()) {
            Set<Long> answeredQuestionIds = new HashSet<>();
            for (InterviewMessage message : messageRepository.findBySessionIdAndRoleOrderBySeqAsc(
                    sessionId, MessageRole.CANDIDATE)) {
                if (message.getQuestion() != null) {
                    answeredQuestionIds.add(message.getQuestion().getId());
                }
            }
            if (!answeredQuestionIds.isEmpty() && !reviewQuestionIds.equals(answeredQuestionIds)) {
                throw new BusinessException(ErrorCode.INVALID_PARAM);
            }
        }

        Report report = new Report();
        report.setSession(session);
        report.setGrade(ReportGrade.valueOf(request.grade()));
        report.setTotalScore(BigDecimal.valueOf(request.totalScore()));
        report.setDimensionScores(dimensionMap(request.dimensionScores()));
        report.setSummary(request.summary().trim());
        report.setHighlights(List.copyOf(request.highlights()));
        report.setWeaknesses(List.copyOf(request.weaknesses()));
        report.setPartial(request.partial());
        reportRepository.save(report);

        List<QuestionReview> reviews = request.questionReviews().stream()
                .map(result -> toReview(report, questionsById.get(result.questionId()), result))
                .toList();
        reviewRepository.saveAll(reviews);

        if (session.getStatus() != InterviewStatus.ABORTED) {
            session.setStatus(InterviewStatus.COMPLETED);
        }
        if (session.getEndedAt() == null) {
            session.setEndedAt(Instant.now());
        }
        session.setGradingStatus(GradingStatus.READY);
        session.setGradingError(null);
    }

    @Transactional
    public void applyGradeFailure(Long sessionId, GradeFailedRequest request) {
        InterviewSession session = lockedSession(sessionId);
        if (session.getGradingStatus() == GradingStatus.READY) {
            return;
        }
        session.setGradingStatus(GradingStatus.FAILED);
        session.setGradingError(sanitizeError(request.errorCode(), request.errorMessage()));
    }

    @Transactional(readOnly = true)
    public ReportResponse get(Long userId, Long sessionId) {
        InterviewSession session = sessionRepository
                .findByIdAndDeletedFalse(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!session.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        Report report = reportRepository
                .findBySessionId(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));

        Map<Long, QuestionReview> reviewsByQuestion = new HashMap<>();
        for (QuestionReview review : reviewRepository.findByReportId(report.getId())) {
            reviewsByQuestion.put(review.getQuestion().getId(), review);
        }
        Map<Long, InterviewMessage> primaryAnswers = new HashMap<>();
        for (InterviewMessage message :
                messageRepository.findBySessionIdAndRoleOrderBySeqAsc(sessionId, MessageRole.CANDIDATE)) {
            if (message.getQuestion() != null) {
                primaryAnswers.putIfAbsent(message.getQuestion().getId(), message);
            }
        }
        List<ReportResponse.Question> questions =
                questionRepository.findBySessionIdOrderBySortOrder(sessionId).stream()
                        .map(question -> questionResponse(
                                question,
                                reviewsByQuestion.get(question.getId()),
                                primaryAnswers.get(question.getId())))
                        .toList();

        return new ReportResponse(
                session.getId(),
                report.getGrade().name(),
                report.getTotalScore(),
                session.getJobTitle(),
                report.getCreatedAt(),
                config(session),
                dimensions(report),
                report.getSummary(),
                report.getHighlights(),
                report.getWeaknesses(),
                report.isPartial(),
                questions);
    }

    private InterviewSession lockedSession(Long sessionId) {
        return sessionRepository
                .findByIdForUpdate(sessionId)
                .filter(session -> !session.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
    }

    private QuestionReview toReview(
            Report report,
            Question question,
            GradeResultRequest.QuestionReviewResult result) {
        QuestionReview review = new QuestionReview();
        review.setReport(report);
        review.setQuestion(question);
        review.setScore(result.score());
        review.setReferenceAnswer(result.referenceAnswer().trim());
        review.setSuggestions(List.copyOf(result.suggestions()));
        review.setFollowUpChainJson(List.copyOf(result.followUpChain()));
        return review;
    }

    private Map<String, Object> dimensionMap(GradeResultRequest.DimensionScores scores) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("professionalKnowledge", scores.professionalKnowledge());
        values.put("projectDepth", scores.projectDepth());
        values.put("communicationLogic", scores.communicationLogic());
        values.put("adaptability", scores.adaptability());
        values.put("jobFit", scores.jobFit());
        return values;
    }

    private GradeResultRequest.DimensionScores dimensions(Report report) {
        Map<String, Object> scores = report.getDimensionScores();
        if (!hasAllNumericDimensions(scores)) {
            LOGGER.warn("report dimension scores are invalid, reportId={}", report.getId());
            return null;
        }
        return new GradeResultRequest.DimensionScores(
                intValue(scores, "professionalKnowledge"),
                intValue(scores, "projectDepth"),
                intValue(scores, "communicationLogic"),
                intValue(scores, "adaptability"),
                intValue(scores, "jobFit"));
    }

    private boolean hasAllNumericDimensions(Map<String, Object> values) {
        return values != null
                && values.get("professionalKnowledge") instanceof Number
                && values.get("projectDepth") instanceof Number
                && values.get("communicationLogic") instanceof Number
                && values.get("adaptability") instanceof Number
                && values.get("jobFit") instanceof Number;
    }

    private int intValue(Map<String, Object> values, String key) {
        return ((Number) values.get(key)).intValue();
    }

    private ReportResponse.Config config(InterviewSession session) {
        return new ReportResponse.Config(
                session.getJobDirection(),
                session.getJobTitle(),
                session.getJdText(),
                lower(session.getDifficulty()),
                session.getTypes(),
                session.getDurationMin(),
                session.getCustomRequirements(),
                lower(session.getInterviewerStyle()),
                session.isVoiceEnabled());
    }

    private ReportResponse.Question questionResponse(
            Question question, QuestionReview review, InterviewMessage answer) {
        return new ReportResponse.Question(
                question.getId(),
                question.getSortOrder(),
                lower(question.getPhase()),
                question.getText(),
                question.getFocusPoints() == null ? List.of() : question.getFocusPoints(),
                answer == null ? null : answer.getContent(),
                review == null ? null : review.getScore(),
                question.getThinkSeconds(),
                question.getAnswerSeconds(),
                question.getSuggestedSeconds(),
                review == null ? null : review.getReferenceAnswer(),
                review == null ? List.of() : review.getSuggestions(),
                review == null ? List.of() : review.getFollowUpChainJson(),
                answer == null ? null : answer.getAudioUrl());
    }

    private String sanitizeError(String code, String message) {
        String safeCode = code.trim().replaceAll("[\\p{Cntrl}\\s]+", "_");
        String safeMessage = SECRET_ASSIGNMENT
                .matcher(message)
                .replaceAll("$1=[REDACTED]");
        safeMessage = BEARER_SECRET.matcher(safeMessage).replaceAll("Bearer [REDACTED]");
        safeMessage = safeMessage.replaceAll("[\\p{Cntrl}\\s]+", " ").trim();
        String combined = safeCode + ": " + safeMessage;
        return combined.substring(0, Math.min(MAX_STORED_ERROR_LENGTH, combined.length()));
    }

    private String gradeForScore(int score) {
        if (score >= 90) {
            return "S";
        }
        if (score >= 80) {
            return "A";
        }
        if (score >= 70) {
            return "B";
        }
        if (score >= 60) {
            return "C";
        }
        return "D";
    }

    private String lower(Enum<?> value) {
        return value == null ? null : value.name().toLowerCase(Locale.ROOT);
    }
}
