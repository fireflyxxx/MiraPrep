package com.miraprep;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.miraprep.client.AiServiceClient;
import com.miraprep.domain.GradingStatus;
import com.miraprep.domain.InterviewDifficulty;
import com.miraprep.domain.InterviewPhase;
import com.miraprep.domain.InterviewSession;
import com.miraprep.domain.InterviewSessionType;
import com.miraprep.domain.InterviewStatus;
import com.miraprep.domain.InterviewerStyle;
import com.miraprep.domain.OutlineStatus;
import com.miraprep.domain.PracticeTargetType;
import com.miraprep.domain.Question;
import com.miraprep.domain.QuestionReview;
import com.miraprep.domain.Report;
import com.miraprep.domain.ReportGrade;
import com.miraprep.domain.User;
import com.miraprep.interview.InterviewSessionRepository;
import com.miraprep.interview.PracticeSessionRepository;
import com.miraprep.interview.PracticeService;
import com.miraprep.interview.dto.CreatePracticeRequest;
import com.miraprep.interview.QuestionRepository;
import com.miraprep.report.QuestionReviewRepository;
import com.miraprep.report.ReportRepository;
import com.miraprep.resume.ObjectStorageService;
import com.miraprep.user.UserRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(classes = BusinessApplication.class)
@AutoConfigureMockMvc
class PracticeApiIntegrationTest {

    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private InterviewSessionRepository sessionRepository;
    @Autowired private QuestionRepository questionRepository;
    @Autowired private ReportRepository reportRepository;
    @Autowired private QuestionReviewRepository reviewRepository;
    @Autowired private PracticeSessionRepository practiceSessionRepository;
    @Autowired private PracticeService practiceService;

    @MockBean private ObjectStorageService objectStorageService;
    @MockBean private AiServiceClient aiServiceClient;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:h2:mem:practice-api;MODE=MySQL;DB_CLOSE_DELAY=-1");
        registry.add("spring.datasource.driver-class-name", () -> "org.h2.Driver");
        registry.add("spring.datasource.username", () -> "sa");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.data.redis.repositories.enabled", () -> false);
        registry.add("app.auth.jwt-secret", () -> "test-jwt-secret-that-is-long-enough-for-hmac-sha256");
        registry.add("app.auth.token-store", () -> "memory");
        registry.add("app.auth.rate-limiter", () -> "memory");
        registry.add("app.internal-token", () -> "test-internal-token");
        registry.add("app.interview.create-max-attempts", () -> "3");
        registry.add("app.interview.create-window", () -> "60");
    }

    @Test
    void practiceSchemaStoresSessionTypeAndSourceLinks() {
        Integer sessionTypeColumns = jdbcTemplate.queryForObject(
                "select count(*) from information_schema.columns "
                        + "where table_name = 'INTERVIEW_SESSION' and column_name = 'SESSION_TYPE'",
                Integer.class);
        Integer practiceTables = jdbcTemplate.queryForObject(
                "select count(*) from information_schema.tables where table_name = 'PRACTICE_SESSION'",
                Integer.class);
        Integer targetTypeColumns = jdbcTemplate.queryForObject(
                "select count(*) from information_schema.columns "
                        + "where table_name = 'PRACTICE_SESSION' and column_name = 'TARGET_TYPE'",
                Integer.class);
        Integer baselineScoreColumns = jdbcTemplate.queryForObject(
                "select count(*) from information_schema.columns "
                        + "where table_name = 'QUESTION_REVIEW' and column_name = 'BASELINE_SCORE'",
                Integer.class);
        Integer comparisonColumns = jdbcTemplate.queryForObject(
                "select count(*) from information_schema.columns "
                        + "where table_name = 'QUESTION_REVIEW' and column_name = 'COMPARISON_JSON'",
                Integer.class);
        Integer sourceFollowUpColumns = jdbcTemplate.queryForObject(
                "select count(*) from information_schema.columns "
                        + "where table_name = 'PRACTICE_SESSION' and column_name = 'SOURCE_FOLLOW_UPS_JSON'",
                Integer.class);

        assertThat(sessionTypeColumns).isEqualTo(1);
        assertThat(practiceTables).isEqualTo(1);
        assertThat(targetTypeColumns).isEqualTo(1);
        assertThat(baselineScoreColumns).isEqualTo(1);
        assertThat(comparisonColumns).isEqualTo(1);
        assertThat(sourceFollowUpColumns).isEqualTo(1);
    }

    @Test
    void createPracticeClonesOneQuestionAndStartsPracticeRuntime() throws Exception {
        User owner = createUser();
        InterviewSession source = createSourceSession(owner);
        Question sourceQuestion = createQuestion(source, "如何定位一次线上性能问题？");
        createReport(source, sourceQuestion, 68, "先查看监控和慢查询");

        var response = mockMvc.perform(post(
                                "/api/v1/interviews/{sessionId}/questions/{questionId}/retry",
                                source.getId(),
                                sourceQuestion.getId())
                        .with(user(Long.toString(owner.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.practiceSessionId").isNumber())
                .andExpect(jsonPath("$.data.runtimeToken").isString())
                .andReturn();

        Number practiceId = com.jayway.jsonpath.JsonPath.read(
                response.getResponse().getContentAsString(), "$.data.practiceSessionId");
        InterviewSession practice = sessionRepository.findById(practiceId.longValue()).orElseThrow();
        assertThat(practice.getSessionType()).isEqualTo(InterviewSessionType.PRACTICE);
        assertThat(practice.getStatus()).isEqualTo(InterviewStatus.ONGOING);
        assertThat(practice.getOutlineStatus()).isEqualTo(OutlineStatus.READY);
        assertThat(questionRepository.findBySessionIdOrderBySortOrder(practice.getId()))
                .singleElement()
                .satisfies(question -> {
                    assertThat(question.getText()).isEqualTo(sourceQuestion.getText());
                    assertThat(question.getId()).isNotEqualTo(sourceQuestion.getId());
                });
        assertThat(practiceSessionRepository.findById(practice.getId()).orElseThrow()
                        .getSourceQuestion()
                        .getId())
                .isEqualTo(sourceQuestion.getId());
        assertThat(source.getStatus()).isEqualTo(InterviewStatus.COMPLETED);

        verify(aiServiceClient).startInterviewRuntime(argThat(request -> {
            try {
                return request.sessionId().equals(practice.getId())
                        && request.questions().size() == 1
                        && request.getClass().getMethod("mode").invoke(request).equals("practice")
                        && request.getClass()
                                .getMethod("practiceTarget")
                                .invoke(request)
                                .equals("main_question");
            } catch (ReflectiveOperationException exception) {
                return false;
            }
        }));
    }

    @Test
    void createFollowUpPracticeClonesSelectedPromptAndRejectsOutOfRangeIndex() throws Exception {
        User owner = createUser();
        InterviewSession source = createSourceSession(owner);
        Question sourceQuestion = createQuestion(source, "请介绍一次性能优化项目");
        createReportWithFollowUp(
                source,
                sourceQuestion,
                78,
                "我负责把接口耗时从 800ms 降到 180ms",
                "你怎样确认瓶颈位置？",
                "我结合监控、日志和压测逐层定位",
                7);

        var response = mockMvc.perform(post(
                                "/api/v1/interviews/{sessionId}/questions/{questionId}/retry",
                                source.getId(),
                                sourceQuestion.getId())
                        .with(user(Long.toString(owner.getId())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"targetType":"FOLLOW_UP","followUpIndex":0}
                                """))
                .andExpect(status().isOk())
                .andReturn();

        Number practiceId = com.jayway.jsonpath.JsonPath.read(
                response.getResponse().getContentAsString(), "$.data.practiceSessionId");
        assertThat(questionRepository.findBySessionIdOrderBySortOrder(practiceId.longValue()))
                .singleElement()
                .extracting(Question::getText)
                .isEqualTo("你怎样确认瓶颈位置？");
        assertThat(jdbcTemplate.queryForObject(
                        "select target_type from practice_session where session_id = ?",
                        String.class,
                        practiceId.longValue()))
                .isEqualTo("FOLLOW_UP");
        assertThat(jdbcTemplate.queryForObject(
                        "select source_score from practice_session where session_id = ?",
                        BigDecimal.class,
                        practiceId.longValue()))
                .isEqualByComparingTo("7");

        verify(aiServiceClient).startInterviewRuntime(argThat(request -> {
            try {
                return request.sessionId().equals(practiceId.longValue())
                        && request.getClass()
                                .getMethod("practiceTarget")
                                .invoke(request)
                                .equals("follow_up");
            } catch (ReflectiveOperationException exception) {
                return false;
            }
        }));

        mockMvc.perform(post(
                                "/api/v1/interviews/{sessionId}/questions/{questionId}/retry",
                                source.getId(),
                                sourceQuestion.getId())
                        .with(user(Long.toString(owner.getId())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"targetType":"FOLLOW_UP","followUpIndex":1}
                                """))
                .andExpect(status().isNotFound());
    }

    @Test
    void createPracticeRejectsForeignOwnerAndQuestionMismatch() throws Exception {
        User owner = createUser();
        User other = createUser();
        InterviewSession source = createSourceSession(owner);
        Question sourceQuestion = createQuestion(source, "来源题");
        createReport(source, sourceQuestion, 70, "来源回答");
        InterviewSession another = createSourceSession(owner);
        Question foreignQuestion = createQuestion(another, "另一场题目");
        createReport(another, foreignQuestion, 72, "另一场回答");

        mockMvc.perform(post(
                                "/api/v1/interviews/{sessionId}/questions/{questionId}/retry",
                                source.getId(),
                                sourceQuestion.getId())
                        .with(user(Long.toString(other.getId()))))
                .andExpect(status().isForbidden());

        mockMvc.perform(post(
                                "/api/v1/interviews/{sessionId}/questions/{questionId}/retry",
                                source.getId(),
                                foreignQuestion.getId())
                        .with(user(Long.toString(owner.getId()))))
                .andExpect(status().isNotFound());
    }

    @Test
    void createPracticeIsRateLimitedPerUser() throws Exception {
        User owner = createUser();
        InterviewSession source = createSourceSession(owner);
        Question sourceQuestion = createQuestion(source, "来源题");
        createReport(source, sourceQuestion, 68, "来源回答");

        for (int attempt = 0; attempt < 3; attempt++) {
            mockMvc.perform(post(
                                    "/api/v1/interviews/{sessionId}/questions/{questionId}/retry",
                                    source.getId(),
                                    sourceQuestion.getId())
                            .with(user(Long.toString(owner.getId()))))
                    .andExpect(status().isOk());
        }

        mockMvc.perform(post(
                                "/api/v1/interviews/{sessionId}/questions/{questionId}/retry",
                                source.getId(),
                                sourceQuestion.getId())
                        .with(user(Long.toString(owner.getId()))))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void practiceResultCombinesSourceAndCurrentAttempts() throws Exception {
        User owner = createUser();
        InterviewSession source = createSourceSession(owner);
        Question sourceQuestion = createQuestion(source, "如何定位一次线上性能问题？");
        createReportWithFollowUp(
                source,
                sourceQuestion,
                68,
                "先查看监控和慢查询",
                "旧追问快照",
                "旧追问回答快照",
                7);
        long practiceId = practiceService.create(owner.getId(), source.getId(), sourceQuestion.getId())
                .practiceSessionId();
        Report sourceReport = reportRepository.findBySessionId(source.getId()).orElseThrow();
        QuestionReview mutableSourceReview = reviewRepository
                .findByReportIdAndQuestionId(sourceReport.getId(), sourceQuestion.getId())
                .orElseThrow();
        mutableSourceReview.setFollowUpChainJson(List.of(Map.of(
                "question", "来源报告后来被重批改",
                "answer", "这不应改变已创建练习的来源快照",
                "score", 2,
                "referenceAnswer", "新参考",
                "suggestions", List.of("新建议"))));
        reviewRepository.save(mutableSourceReview);
        InterviewSession practice = sessionRepository.findById(practiceId).orElseThrow();
        Question practiceQuestion = questionRepository
                .findBySessionIdOrderBySortOrder(practiceId)
                .getFirst();
        practice.setStatus(InterviewStatus.COMPLETED);
        practice.setGradingStatus(GradingStatus.READY);
        practice.setEndedAt(Instant.parse("2026-08-10T10:30:00Z"));
        sessionRepository.save(practice);
        createReportWithFollowUp(
                practice,
                practiceQuestion,
                82,
                "按指标、日志、压测逐层定位并验证收益",
                "你如何验证优化没有引入回归？",
                "我补充了基准压测和核心链路回归",
                9);

        mockMvc.perform(get(
                                "/api/v1/interviews/{practiceSessionId}/practice-result",
                                practiceId)
                        .with(user(Long.toString(owner.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ready"))
                .andExpect(jsonPath("$.data.question").value(sourceQuestion.getText()))
                .andExpect(jsonPath("$.data.source.answer").value("先查看监控和慢查询"))
                .andExpect(jsonPath("$.data.source.score").value(68))
                .andExpect(jsonPath("$.data.source.followUps[0].question").value("旧追问快照"))
                .andExpect(jsonPath("$.data.source.followUps[0].answer").value("旧追问回答快照"))
                .andExpect(jsonPath("$.data.current.answer")
                        .value("按指标、日志、压测逐层定位并验证收益"))
                .andExpect(jsonPath("$.data.current.score").value(82))
                .andExpect(jsonPath("$.data.current.followUps[0].question")
                        .value("你如何验证优化没有引入回归？"))
                .andExpect(jsonPath("$.data.current.followUps[0].score").value(9))
                .andExpect(jsonPath("$.data.scoreDelta").value(14));
    }

    @Test
    void followUpPracticeResultUsesIndependentSourceAndCurrentScores() throws Exception {
        User owner = createUser();
        InterviewSession source = createSourceSession(owner);
        Question sourceQuestion = createQuestion(source, "请介绍一次性能优化项目");
        createReportWithFollowUp(
                source,
                sourceQuestion,
                78,
                "我负责接口性能优化",
                "你怎样确认瓶颈位置？",
                "我结合监控、日志和压测逐层定位",
                7);
        long practiceId = practiceService
                .create(
                        owner.getId(),
                        source.getId(),
                        sourceQuestion.getId(),
                        new CreatePracticeRequest(PracticeTargetType.FOLLOW_UP, 0))
                .practiceSessionId();
        InterviewSession practice = sessionRepository.findById(practiceId).orElseThrow();
        Question practiceQuestion = questionRepository
                .findBySessionIdOrderBySortOrder(practiceId)
                .getFirst();
        practice.setStatus(InterviewStatus.COMPLETED);
        practice.setGradingStatus(GradingStatus.READY);
        practice.setEndedAt(Instant.parse("2026-08-10T10:30:00Z"));
        sessionRepository.save(practice);
        createReport(practice, practiceQuestion, 8, "我先用指标缩小范围，再用实验确认根因");

        mockMvc.perform(get(
                                "/api/v1/interviews/{practiceSessionId}/practice-result",
                                practiceId)
                        .with(user(Long.toString(owner.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.targetType").value("FOLLOW_UP"))
                .andExpect(jsonPath("$.data.followUpIndex").value(0))
                .andExpect(jsonPath("$.data.question").value("你怎样确认瓶颈位置？"))
                .andExpect(jsonPath("$.data.source.answer")
                        .value("我结合监控、日志和压测逐层定位"))
                .andExpect(jsonPath("$.data.source.score").value(7))
                .andExpect(jsonPath("$.data.current.score").value(8))
                .andExpect(jsonPath("$.data.scoreDelta").value(1));
    }

    @Test
    void practiceRuntimeCompletionStartsGradingWithoutFollowUpPhase() throws Exception {
        User owner = createUser();
        InterviewSession source = createSourceSession(owner);
        Question sourceQuestion = createQuestion(source, "来源题");
        createReportWithFollowUp(
                source,
                sourceQuestion,
                7,
                "来源回答",
                "旧追问",
                "旧追问补充了失败队列",
                6);
        long practiceId = practiceService.create(owner.getId(), source.getId(), sourceQuestion.getId())
                .practiceSessionId();
        Question practiceQuestion = questionRepository
                .findBySessionIdOrderBySortOrder(practiceId)
                .getFirst();
        jdbcTemplate.update(
                "insert into interview_message(session_id, role, content, phase, question_id, seq, created_at, updated_at) "
                        + "values (?, 'CANDIDATE', ?, 'DOMAIN_ASSESSMENT', ?, 2, current_timestamp, current_timestamp)",
                practiceId,
                "本次练习回答",
                practiceQuestion.getId());

        mockMvc.perform(post("/api/v1/internal/interviews/{id}/grading-request", practiceId)
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType("application/json")
                        .content("""
                                {"reason":"practice_completed","requestId":"practice:%d:grading"}
                                """.formatted(practiceId)))
                .andExpect(status().isOk());

        InterviewSession practice = sessionRepository.findById(practiceId).orElseThrow();
        assertThat(practice.getStatus()).isEqualTo(InterviewStatus.COMPLETED);
        assertThat(practice.getGradingStatus()).isEqualTo(GradingStatus.PENDING);

        var requestCaptor =
                org.mockito.ArgumentCaptor.forClass(AiServiceClient.InterviewGradeRequest.class);
        verify(aiServiceClient, times(1)).requestInterviewGrade(requestCaptor.capture());
        assertThat(requestCaptor.getValue().transcript())
                .singleElement()
                .satisfies(item -> {
                    assertThat(item.baselineAnswer()).isEqualTo("来源回答");
                    assertThat(item.baselineScore()).isEqualByComparingTo("7");
                    assertThat(item.baselineFollowUps())
                            .singleElement()
                            .satisfies(followUp -> assertThat(followUp.get("answer"))
                                    .isEqualTo("旧追问补充了失败队列"));
                });
    }

    @Test
    void legacyFollowUpPracticeRequestsBaselineScoreForTheSourceAnswer() throws Exception {
        User owner = createUser();
        InterviewSession source = createSourceSession(owner);
        Question sourceQuestion = createQuestion(source, "请介绍一次性能优化项目");
        createReportWithFollowUp(
                source,
                sourceQuestion,
                78,
                "我负责接口性能优化",
                "你怎样确认瓶颈位置？",
                "我结合监控、日志和压测逐层定位",
                null);
        long practiceId = practiceService
                .create(
                        owner.getId(),
                        source.getId(),
                        sourceQuestion.getId(),
                        new CreatePracticeRequest(PracticeTargetType.FOLLOW_UP, 0))
                .practiceSessionId();
        Question practiceQuestion = questionRepository
                .findBySessionIdOrderBySortOrder(practiceId)
                .getFirst();
        jdbcTemplate.update(
                "insert into interview_message(session_id, role, content, phase, question_id, seq, created_at, updated_at) "
                        + "values (?, 'CANDIDATE', ?, 'DOMAIN_ASSESSMENT', ?, 2, current_timestamp, current_timestamp)",
                practiceId,
                "我先用指标缩小范围，再用实验确认根因",
                practiceQuestion.getId());

        mockMvc.perform(post("/api/v1/internal/interviews/{id}/grading-request", practiceId)
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType("application/json")
                        .content("""
                                {"reason":"practice_completed","requestId":"practice:%d:grading"}
                                """.formatted(practiceId)))
                .andExpect(status().isOk());

        var requestCaptor =
                org.mockito.ArgumentCaptor.forClass(AiServiceClient.InterviewGradeRequest.class);
        verify(aiServiceClient, times(1)).requestInterviewGrade(requestCaptor.capture());
        assertThat(requestCaptor.getValue().transcript())
                .singleElement()
                .extracting(AiServiceClient.InterviewGradeTranscriptQuestion::baselineAnswer)
                .isEqualTo("我结合监控、日志和压测逐层定位");
    }

    @Test
    void legacyFollowUpBaselineScoreIsPersistedAndReturned() throws Exception {
        User owner = createUser();
        InterviewSession source = createSourceSession(owner);
        Question sourceQuestion = createQuestion(source, "请介绍一次性能优化项目");
        createReportWithFollowUp(
                source,
                sourceQuestion,
                78,
                "我负责接口性能优化",
                "你怎样确认瓶颈位置？",
                "我结合监控、日志和压测逐层定位",
                null);
        long practiceId = practiceService
                .create(
                        owner.getId(),
                        source.getId(),
                        sourceQuestion.getId(),
                        new CreatePracticeRequest(PracticeTargetType.FOLLOW_UP, 0))
                .practiceSessionId();
        Question practiceQuestion = questionRepository
                .findBySessionIdOrderBySortOrder(practiceId)
                .getFirst();
        jdbcTemplate.update(
                "insert into interview_message(session_id, role, content, phase, question_id, seq, created_at, updated_at) "
                        + "values (?, 'CANDIDATE', ?, 'DOMAIN_ASSESSMENT', ?, 2, current_timestamp, current_timestamp)",
                practiceId,
                "我先用指标缩小范围，再用实验确认根因",
                practiceQuestion.getId());

        mockMvc.perform(post("/api/v1/internal/interviews/{id}/grade-result", practiceId)
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "grade":"A",
                                  "totalScore":80,
                                  "dimensionScores":{
                                    "professionalKnowledge":80,
                                    "projectDepth":80,
                                    "communicationLogic":80,
                                    "adaptability":80,
                                    "jobFit":80
                                  },
                                  "summary":"回答更聚焦",
                                  "highlights":["定位路径清楚"],
                                  "weaknesses":["补充量化结果"],
                                  "partial":false,
                                  "questionReviews":[{
                                    "questionId":%d,
                                    "score":8,
                                    "baselineScore":6,
                                    "comparison":{
                                      "improvements":["补充了实验验证步骤"],
                                      "remainingGaps":["缺少量化结果"],
                                      "scoreRationale":"定位链路更完整，因此由 6 分提升至 8 分。"
                                    },
                                    "referenceAnswer":"先缩小范围，再验证根因。",
                                    "suggestions":["补充实验数据"],
                                    "followUpChain":[]
                                  }]
                                }
                                """.formatted(practiceQuestion.getId())))
                .andExpect(status().isOk());

        mockMvc.perform(get(
                                "/api/v1/interviews/{practiceSessionId}/practice-result",
                                practiceId)
                        .with(user(Long.toString(owner.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.source.score").value(6))
                .andExpect(jsonPath("$.data.current.score").value(8))
                .andExpect(jsonPath("$.data.scoreDelta").value(2))
                .andExpect(jsonPath("$.data.comparison.improvements[0]")
                        .value("补充了实验验证步骤"))
                .andExpect(jsonPath("$.data.comparison.remainingGaps[0]")
                        .value("缺少量化结果"))
                .andExpect(jsonPath("$.data.comparison.scoreRationale")
                        .value("定位链路更完整，因此由 6 分提升至 8 分。"));
    }

    @Test
    void practiceDoesNotAppearInInterviewListsOrStatistics() throws Exception {
        User owner = createUser();
        InterviewSession source = createSourceSession(owner);
        Question sourceQuestion = createQuestion(source, "来源题");
        createReport(source, sourceQuestion, 68, "来源回答");
        long practiceId = practiceService.create(owner.getId(), source.getId(), sourceQuestion.getId())
                .practiceSessionId();
        InterviewSession practice = sessionRepository.findById(practiceId).orElseThrow();
        Question practiceQuestion = questionRepository
                .findBySessionIdOrderBySortOrder(practiceId)
                .getFirst();
        practice.setStatus(InterviewStatus.COMPLETED);
        practice.setGradingStatus(GradingStatus.READY);
        practice.setEndedAt(Instant.parse("2026-08-10T10:30:00Z"));
        sessionRepository.save(practice);
        createReport(practice, practiceQuestion, 82, "本次回答");

        mockMvc.perform(get("/api/v1/interviews").with(user(Long.toString(owner.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].sessionId").value(source.getId()));

        mockMvc.perform(get("/api/v1/stats/overview").with(user(Long.toString(owner.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalInterviews").value(1))
                .andExpect(jsonPath("$.data.basedOnCompletedInterviews").value(1));

        mockMvc.perform(get("/api/v1/stats/history").with(user(Long.toString(owner.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.points.length()").value(1))
                .andExpect(jsonPath("$.data.points[0].sessionId").value(source.getId()));
    }

    private User createUser() {
        User user = new User();
        user.setEmail("practice-" + UUID.randomUUID() + "@example.com");
        user.setPasswordHash("test-only");
        return userRepository.save(user);
    }

    private InterviewSession createSourceSession(User owner) {
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
        session.setVoiceEnabled(true);
        session.setStatus(InterviewStatus.COMPLETED);
        session.setOutlineStatus(OutlineStatus.READY);
        session.setGradingStatus(GradingStatus.READY);
        session.setStartedAt(Instant.parse("2026-08-10T10:00:00Z"));
        session.setEndedAt(Instant.parse("2026-08-10T10:20:00Z"));
        return sessionRepository.save(session);
    }

    private Question createQuestion(InterviewSession session, String text) {
        Question question = new Question();
        question.setSession(session);
        question.setPhase(InterviewPhase.DOMAIN_ASSESSMENT);
        question.setText(text);
        question.setFocusPoints(List.of("分析路径", "解决效果"));
        question.setSortOrder(1);
        question.setSuggestedSeconds(120);
        return questionRepository.save(question);
    }

    private void createReport(
            InterviewSession session, Question question, int score, String answer) {
        Report report = new Report();
        report.setSession(session);
        report.setGrade(score >= 80 ? ReportGrade.A : ReportGrade.C);
        report.setTotalScore(BigDecimal.valueOf(score));
        report.setDimensionScores(Map.of(
                "professionalKnowledge", score,
                "projectDepth", score,
                "communicationLogic", score,
                "adaptability", score,
                "jobFit", score));
        report.setSummary("来源报告");
        report.setHighlights(List.of("分析清楚"));
        report.setWeaknesses(List.of("量化不足"));
        report = reportRepository.save(report);

        QuestionReview review = new QuestionReview();
        review.setReport(report);
        review.setQuestion(question);
        review.setScore(BigDecimal.valueOf(score));
        review.setReferenceAnswer("先确认指标，再定位瓶颈并验证修复。");
        review.setSuggestions(List.of("补充量化结果"));
        review.setFollowUpChainJson(List.of());
        reviewRepository.save(review);

        jdbcTemplate.update(
                "insert into interview_message(session_id, role, content, phase, question_id, seq, created_at, updated_at) "
                        + "values (?, 'CANDIDATE', ?, 'DOMAIN_ASSESSMENT', ?, 2, current_timestamp, current_timestamp)",
                session.getId(),
                answer,
                question.getId());
    }

    private void createReportWithFollowUp(
            InterviewSession session,
            Question question,
            int score,
            String answer,
            String followUpQuestion,
            String followUpAnswer,
            Integer followUpScore) {
        createReport(session, question, score, answer);
        Report report = reportRepository.findBySessionId(session.getId()).orElseThrow();
        QuestionReview review = reviewRepository
                .findByReportIdAndQuestionId(report.getId(), question.getId())
                .orElseThrow();
        Map<String, Object> followUp = new java.util.LinkedHashMap<>();
        followUp.put("question", followUpQuestion);
        followUp.put("answer", followUpAnswer);
        followUp.put("answerSeconds", 18);
        if (followUpScore != null) {
            followUp.put("score", followUpScore);
        }
        followUp.put("referenceAnswer", "先用指标缩小范围，再通过实验确认根因。");
        followUp.put("suggestions", List.of("补充排除其他因素的过程"));
        review.setFollowUpChainJson(List.of(followUp));
        reviewRepository.save(review);
    }
}
