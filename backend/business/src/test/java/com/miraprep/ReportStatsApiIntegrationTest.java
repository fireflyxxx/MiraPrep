package com.miraprep;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.miraprep.domain.GradingStatus;
import com.miraprep.domain.InterviewDifficulty;
import com.miraprep.domain.InterviewerStyle;
import com.miraprep.domain.InterviewMessage;
import com.miraprep.domain.InterviewPhase;
import com.miraprep.domain.InterviewSession;
import com.miraprep.domain.InterviewStatus;
import com.miraprep.domain.MessageRole;
import com.miraprep.domain.OutlineStatus;
import com.miraprep.domain.Question;
import com.miraprep.domain.User;
import com.miraprep.interview.InterviewMessageRepository;
import com.miraprep.interview.InterviewSessionRepository;
import com.miraprep.interview.QuestionRepository;
import com.miraprep.report.ReportRepository;
import com.miraprep.user.UserRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.UserRequestPostProcessor;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(classes = BusinessApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ReportStatsApiIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private InterviewSessionRepository sessionRepository;
    @Autowired private QuestionRepository questionRepository;
    @Autowired private InterviewMessageRepository messageRepository;
    @Autowired private ReportRepository reportRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add(
                "spring.datasource.url",
                () -> "jdbc:h2:mem:report-stats;MODE=MySQL;DB_CLOSE_DELAY=-1");
        registry.add("spring.datasource.driver-class-name", () -> "org.h2.Driver");
        registry.add("spring.datasource.username", () -> "sa");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.data.redis.repositories.enabled", () -> false);
        registry.add("app.internal-token", () -> "test-internal-token");
    }

    @Test
    void successfulCallbackPersistsACompleteReportAndProjectsItIntoInterviewHistory()
            throws Exception {
        User owner = createUser();
        InterviewSession session = session(owner, Instant.parse("2026-07-20T10:30:00Z"), false);
        Question question = question(session, 1, "请介绍你在 MiraPrep 中做的可靠回调。");
        candidateAnswer(question, "我用数据库事务和行锁保证幂等。", "https://audio.example/answer.mp3");
        message(question, MessageRole.INTERVIEWER, "如果两个回调同时到达呢？", null, 3);
        message(question, MessageRole.CANDIDATE, "我还会依赖唯一约束兜底。", null, 4);

        postGradeResult(session.getId(), gradePayload(question.getId(), 82, "A", false))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/reports/{id}", session.getId()).with(as(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sessionId").value(session.getId()))
                .andExpect(jsonPath("$.data.grade").value("A"))
                .andExpect(jsonPath("$.data.totalScore").value(82))
                .andExpect(jsonPath("$.data.jobTitle").value("Java 工程师"))
                .andExpect(jsonPath("$.data.config.jobDirection").value("backend"))
                .andExpect(jsonPath("$.data.config.types[0]").value("technical"))
                .andExpect(jsonPath("$.data.dimensionScores.projectDepth").value(85))
                .andExpect(jsonPath("$.data.summary").value("总体表现稳定"))
                .andExpect(jsonPath("$.data.highlights[0]").value("项目讲解清楚"))
                .andExpect(jsonPath("$.data.partial").value(false))
                .andExpect(jsonPath("$.data.questions", hasSize(1)))
                .andExpect(jsonPath("$.data.questions[0].order").value(1))
                .andExpect(jsonPath("$.data.questions[0].phase").value("domain_assessment"))
                .andExpect(jsonPath("$.data.questions[0].answer").value("我用数据库事务和行锁保证幂等。"))
                .andExpect(jsonPath("$.data.questions[0].score").value(8))
                .andExpect(jsonPath("$.data.questions[0].audioUrl")
                        .value("https://audio.example/answer.mp3"))
                .andExpect(jsonPath("$.data.questions[0].followUpChain[0].question")
                        .value("如果并发到达呢？"));

        mockMvc.perform(get("/api/v1/interviews").with(as(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].grade").value("A"))
                .andExpect(jsonPath("$.data.items[0].reportStatus").value("ready"));

        mockMvc.perform(get("/api/v1/stats/overview").with(as(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalInterviews").value(1))
                .andExpect(jsonPath("$.data.highestGrade").value("A"))
                .andExpect(jsonPath("$.data.latestGrade").value("A"))
                .andExpect(jsonPath("$.data.overallGrade").value("A"))
                .andExpect(jsonPath("$.data.basedOnCompletedInterviews").value(1))
                .andExpect(jsonPath("$.data.scoreTrend", hasSize(1)))
                .andExpect(jsonPath("$.data.totalPracticeMinutes").value(10));

        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/v1/reports/{sessionId}']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/stats/overview']").exists())
                .andExpect(jsonPath(
                                "$.paths['/api/v1/internal/interviews/{id}/grade-result']")
                        .exists())
                .andExpect(jsonPath(
                                "$.paths['/api/v1/internal/interviews/{id}/grade-failed']")
                        .exists());

        InterviewSession reloaded = sessionRepository.findById(session.getId()).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(reloaded.getStatus())
                .isEqualTo(InterviewStatus.COMPLETED);
        org.assertj.core.api.Assertions.assertThat(reloaded.getGradingStatus())
                .isEqualTo(GradingStatus.READY);
        org.assertj.core.api.Assertions.assertThat(reloaded.getGradingError()).isNull();
    }

    @Test
    void successfulPartialCallbackKeepsAnAbortedSessionAborted() throws Exception {
        User owner = createUser();
        InterviewSession session = session(owner, Instant.parse("2026-07-20T10:30:00Z"), true);
        Question question = question(session, 1, "请介绍事务边界。");
        candidateAnswer(question, "事务负责保证一组写入一起成功。", null);

        postGradeResult(session.getId(), gradePayload(question.getId(), 72, "B", true))
                .andExpect(status().isOk());

        InterviewSession reloaded = sessionRepository.findById(session.getId()).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(reloaded.getStatus())
                .isEqualTo(InterviewStatus.ABORTED);
        org.assertj.core.api.Assertions.assertThat(reloaded.getGradingStatus())
                .isEqualTo(GradingStatus.READY);
    }

    @Test
    void completeCallbackRejectsReviewsThatDoNotCoverEveryAnsweredQuestion() throws Exception {
        User owner = createUser();
        InterviewSession session = session(owner, Instant.parse("2026-07-20T10:30:00Z"), false);
        Question first = question(session, 1, "第一题");
        Question second = question(session, 2, "第二题");
        message(first, MessageRole.CANDIDATE, "第一题回答", null, 2);
        message(second, MessageRole.CANDIDATE, "第二题回答", null, 4);

        postGradeResult(session.getId(), gradePayload(first.getId(), 82, "A", false))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
    }

    @Test
    void callbacksAreIdempotentAndLateFailureCannotOverwriteReady() throws Exception {
        User owner = createUser();
        InterviewSession session = session(owner, Instant.parse("2026-07-20T10:30:00Z"), false);
        Question question = question(session, 1, "如何保证幂等？");

        postGradeResult(session.getId(), gradePayload(question.getId(), 82, "A", false))
                .andExpect(status().isOk());
        postGradeResult(session.getId(), gradePayload(question.getId(), 65, "C", false))
                .andExpect(status().isOk());
        postGradeFailed(
                        session.getId(),
                        """
                        {"errorCode":"UPSTREAM_FAILED","errorMessage":"Bearer secret-token password=hunter2"}
                        """)
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/reports/{id}", session.getId()).with(as(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.grade").value("A"))
                .andExpect(jsonPath("$.data.totalScore").value(82));
        org.assertj.core.api.Assertions.assertThat(
                        jdbcTemplate.queryForObject("select count(*) from report", Long.class))
                .isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(
                        jdbcTemplate.queryForObject("select count(*) from question_review", Long.class))
                .isEqualTo(1);
        InterviewSession reloaded = sessionRepository.findById(session.getId()).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(reloaded.getGradingStatus())
                .isEqualTo(GradingStatus.READY);
        org.assertj.core.api.Assertions.assertThat(reloaded.getGradingError()).isNull();
    }

    @Test
    void failedCallbackIsRecoverableAndStoresOnlyASanitizedBoundedError() throws Exception {
        User owner = createUser();
        InterviewSession session = session(owner, Instant.parse("2026-07-20T10:30:00Z"), false);

        postGradeFailed(
                        session.getId(),
                        """
                        {"errorCode":"MODEL_FAILED","errorMessage":"api_key=top-secret\\nmodel unavailable"}
                        """)
                .andExpect(status().isOk());

        InterviewSession failed = sessionRepository.findById(session.getId()).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(failed.getGradingStatus())
                .isEqualTo(GradingStatus.FAILED);
        org.assertj.core.api.Assertions.assertThat(failed.getGradingError())
                .contains("MODEL_FAILED")
                .contains("model unavailable")
                .doesNotContain("top-secret")
                .doesNotContain("\n");
        mockMvc.perform(get("/api/v1/interviews").with(as(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].grade").value(nullValue()))
                .andExpect(jsonPath("$.data.items[0].reportStatus").value("failed"));

        Question question = question(session, 1, "失败后能否重试？");
        postGradeResult(session.getId(), gradePayload(question.getId(), 90, "S", false))
                .andExpect(status().isOk());
        InterviewSession recovered = sessionRepository.findById(session.getId()).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(recovered.getGradingStatus())
                .isEqualTo(GradingStatus.READY);
        org.assertj.core.api.Assertions.assertThat(recovered.getGradingError()).isNull();
    }

    @Test
    void reportQueryEnforcesOwnershipAndDistinguishesMissingSession() throws Exception {
        User owner = createUser();
        User other = createUser();
        InterviewSession session = session(owner, Instant.parse("2026-07-20T10:30:00Z"), false);
        Question question = question(session, 1, "私有报告");
        postGradeResult(session.getId(), gradePayload(question.getId(), 82, "A", false))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/reports/{id}", session.getId()).with(as(other)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(40300));
        mockMvc.perform(get("/api/v1/reports/{id}", 999999L).with(as(other)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(40400));
    }

    @Test
    void reportQueryKeepsTheReportReadableWhenHistoricalDimensionScoresAreDirty()
            throws Exception {
        User owner = createUser();
        InterviewSession session = session(owner, Instant.parse("2026-07-20T10:30:00Z"), false);
        Question question = question(session, 1, "历史报告");
        postGradeResult(session.getId(), gradePayload(question.getId(), 82, "A", false))
                .andExpect(status().isOk());
        var report = reportRepository.findBySessionId(session.getId()).orElseThrow();
        report.setDimensionScores(Map.of("professionalKnowledge", 75));
        reportRepository.saveAndFlush(report);

        mockMvc.perform(get("/api/v1/reports/{id}", session.getId()).with(as(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dimensionScores").value(nullValue()))
                .andExpect(jsonPath("$.data.summary").value("总体表现稳定"));
    }

    @Test
    void emptyStatsUseNullForUnavailableRatingsInsteadOfInventingZeroScores() throws Exception {
        User owner = createUser();

        mockMvc.perform(get("/api/v1/stats/overview").with(as(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalInterviews").value(0))
                .andExpect(jsonPath("$.data.totalPracticeMinutes").value(0))
                .andExpect(jsonPath("$.data.basedOnCompletedInterviews").value(0))
                .andExpect(jsonPath("$.data.highestGrade").value(nullValue()))
                .andExpect(jsonPath("$.data.latestGrade").value(nullValue()))
                .andExpect(jsonPath("$.data.lastInterviewAt").value(nullValue()))
                .andExpect(jsonPath("$.data.overallGrade").value(nullValue()))
                .andExpect(jsonPath("$.data.overallSummary").value(nullValue()))
                .andExpect(jsonPath("$.data.dimensionScores").value(nullValue()))
                .andExpect(jsonPath("$.data.scoreTrend", hasSize(0)));
    }

    @Test
    void statsUseOnlyTenLatestCompleteReportsButCountAllEndedPractice() throws Exception {
        User owner = createUser();
        Instant base = Instant.parse("2026-07-01T10:00:00Z");

        // 最老的 S 报告会被“最近 10 场”窗口排除。
        persistReport(owner, base, 95, "S", false, 10);
        for (int index = 0; index < 10; index++) {
            persistReport(
                    owner,
                    base.plus(index + 1L, ChronoUnit.DAYS),
                    60 + index,
                    "C",
                    false,
                    10);
        }
        // partial 会计入累计场次和练习时长，但不进入评级、五维与趋势。
        persistReport(owner, base.plus(20, ChronoUnit.DAYS), 99, "S", true, 10);

        mockMvc.perform(get("/api/v1/stats/overview").with(as(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalInterviews").value(12))
                .andExpect(jsonPath("$.data.totalPracticeMinutes").value(120))
                .andExpect(jsonPath("$.data.basedOnCompletedInterviews").value(10))
                .andExpect(jsonPath("$.data.highestGrade").value("C"))
                .andExpect(jsonPath("$.data.latestGrade").value("C"))
                .andExpect(jsonPath("$.data.overallGrade").value("C"))
                .andExpect(jsonPath("$.data.lastInterviewAt").value("2026-07-11T10:00:00Z"))
                .andExpect(jsonPath("$.data.dimensionScores.professionalKnowledge").value(75))
                .andExpect(jsonPath("$.data.dimensionScores.projectDepth").value(85))
                .andExpect(jsonPath("$.data.dimensionScores.communicationLogic").value(80))
                .andExpect(jsonPath("$.data.dimensionScores.adaptability").value(70))
                .andExpect(jsonPath("$.data.dimensionScores.jobFit").value(65))
                .andExpect(jsonPath("$.data.overallSummary")
                        .value("基于最近 10 场：项目深度表现突出，岗位匹配度仍有提升空间。"))
                .andExpect(jsonPath("$.data.scoreTrend", hasSize(10)))
                .andExpect(jsonPath("$.data.scoreTrend[0].score").value(60))
                .andExpect(jsonPath("$.data.scoreTrend[9].score").value(69));
    }

    @Test
    void gradeResultRejectsGradeInconsistentWithTotalScore() throws Exception {
        User owner = createUser();
        InterviewSession session = session(owner, Instant.parse("2026-07-20T10:30:00Z"), false);
        Question question = question(session, 1, "一致性校验");

        postGradeResult(session.getId(), gradePayload(question.getId(), 50, "A", false))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
    }

    @Test
    void gradeResultRejectsForeignQuestionId() throws Exception {
        User owner = createUser();
        InterviewSession session = session(owner, Instant.parse("2026-07-20T10:30:00Z"), false);
        question(session, 1, "本场问题");

        postGradeResult(session.getId(), gradePayload(999_999L, 82, "A", false))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
    }

    @Test
    void gradeResultRejectsDuplicateQuestionIds() throws Exception {
        User owner = createUser();
        InterviewSession session = session(owner, Instant.parse("2026-07-20T10:30:00Z"), false);
        Question question = question(session, 1, "重复评审");
        candidateAnswer(question, "回答", null);

        postGradeResult(session.getId(), duplicateReviewPayload(question.getId()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
    }

    @Test
    void reportShowsPrimaryAnswerNotLaterFollowUp() throws Exception {
        User owner = createUser();
        InterviewSession session = session(owner, Instant.parse("2026-07-20T10:30:00Z"), false);
        Question question = question(session, 1, "同一题的主回答与追问回答");
        message(question, MessageRole.CANDIDATE, "主回答", "https://audio.example/primary.mp3", 2);
        message(question, MessageRole.CANDIDATE, "追问回答", "https://audio.example/followup.mp3", 4);

        postGradeResult(session.getId(), gradePayload(question.getId(), 82, "A", false))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/reports/{id}", session.getId()).with(as(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questions[0].answer").value("主回答"))
                .andExpect(jsonPath("$.data.questions[0].audioUrl")
                        .value("https://audio.example/primary.mp3"));
    }

    private String duplicateReviewPayload(long questionId) {
        String review = ("{\"questionId\":%d,\"score\":8,\"referenceAnswer\":\"参考\","
                        + "\"suggestions\":[\"建议\"],\"followUpChain\":[]}")
                .formatted(questionId);
        return ("{\"grade\":\"A\",\"totalScore\":82,\"dimensionScores\":{"
                        + "\"professionalKnowledge\":75,\"projectDepth\":85,\"communicationLogic\":80,"
                        + "\"adaptability\":70,\"jobFit\":65},\"summary\":\"稳定\","
                        + "\"highlights\":[\"亮点\"],\"weaknesses\":[\"不足\"],\"partial\":false,"
                        + "\"questionReviews\":[%s,%s]}")
                .formatted(review, review);
    }

    private void persistReport(
            User owner, Instant endedAt, int score, String grade, boolean partial, int minutes)
            throws Exception {
        InterviewSession session = session(owner, endedAt, partial);
        session.setStartedAt(endedAt.minus(minutes, ChronoUnit.MINUTES));
        sessionRepository.save(session);
        Question question = question(session, 1, "统计样本");
        postGradeResult(session.getId(), gradePayload(question.getId(), score, grade, partial))
                .andExpect(status().isOk());
    }

    private User createUser() {
        User user = new User();
        user.setEmail("report-" + UUID.randomUUID() + "@example.com");
        user.setPasswordHash("test-only");
        return userRepository.save(user);
    }

    private InterviewSession session(User owner, Instant endedAt, boolean partial) {
        InterviewSession session = new InterviewSession();
        session.setUser(owner);
        session.setJobDirection("backend");
        session.setJobTitle("Java 工程师");
        session.setJdText("构建可靠 API");
        session.setDifficulty(InterviewDifficulty.MEDIUM);
        session.setTypes(List.of("technical"));
        session.setDurationMin(45);
        session.setCustomRequirements("关注 Spring");
        session.setInterviewerStyle(InterviewerStyle.BALANCED);
        session.setStatus(partial ? InterviewStatus.ABORTED : InterviewStatus.COMPLETED);
        session.setOutlineStatus(OutlineStatus.READY);
        session.setGradingStatus(GradingStatus.PENDING);
        session.setStartedAt(endedAt.minus(10, ChronoUnit.MINUTES));
        session.setEndedAt(endedAt);
        return sessionRepository.save(session);
    }

    private Question question(InterviewSession session, int order, String text) {
        Question question = new Question();
        question.setSession(session);
        question.setPhase(InterviewPhase.DOMAIN_ASSESSMENT);
        question.setText(text);
        question.setFocusPoints(List.of("项目深度", "表达逻辑"));
        question.setSortOrder(order);
        question.setThinkSeconds(12);
        question.setAnswerSeconds(88);
        question.setSuggestedSeconds(120);
        return questionRepository.save(question);
    }

    private void candidateAnswer(Question question, String content, String audioUrl) {
        message(question, MessageRole.CANDIDATE, content, audioUrl, 2);
    }

    private void message(
            Question question, MessageRole role, String content, String audioUrl, int seq) {
        InterviewMessage message = new InterviewMessage();
        message.setSession(question.getSession());
        message.setRole(role);
        message.setContent(content);
        message.setAudioUrl(audioUrl);
        message.setPhase(question.getPhase());
        message.setQuestion(question);
        message.setSeq(seq);
        messageRepository.save(message);
    }

    private org.springframework.test.web.servlet.ResultActions postGradeResult(
            long sessionId, String payload) throws Exception {
        return mockMvc.perform(post(
                                "/api/v1/internal/interviews/{id}/grade-result", sessionId)
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType("application/json")
                        .content(payload));
    }

    private org.springframework.test.web.servlet.ResultActions postGradeFailed(
            long sessionId, String payload) throws Exception {
        return mockMvc.perform(post(
                                "/api/v1/internal/interviews/{id}/grade-failed", sessionId)
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType("application/json")
                        .content(payload));
    }

    private String gradePayload(long questionId, int score, String grade, boolean partial) {
        return """
                {
                  "grade":"%s",
                  "totalScore":%d,
                  "dimensionScores":{
                    "professionalKnowledge":75,
                    "projectDepth":85,
                    "communicationLogic":80,
                    "adaptability":70,
                    "jobFit":65
                  },
                  "summary":"总体表现稳定",
                  "highlights":["项目讲解清楚"],
                  "weaknesses":["岗位匹配度可提升"],
                  "partial":%s,
                  "questionReviews":[{
                    "questionId":%d,
                    "score":8,
                    "referenceAnswer":"可结合 MiraPrep 项目说明事务与行锁。",
                    "suggestions":["先说明风险，再说明方案"],
                    "followUpChain":[{"question":"如果并发到达呢？","answer":"使用行锁串行化"}]
                  }]
                }
                """.formatted(grade, score, partial, questionId);
    }

    private UserRequestPostProcessor as(User user) {
        return user(Long.toString(user.getId()));
    }
}
