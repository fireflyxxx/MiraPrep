package com.miraprep;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import com.miraprep.domain.ResumeParseStatus;
import com.miraprep.domain.User;
import com.miraprep.interview.InterviewMessageRepository;
import com.miraprep.interview.InterviewSessionRepository;
import com.miraprep.interview.QuestionRepository;
import com.miraprep.resume.ObjectStorageService;
import com.miraprep.resume.ResumeRepository;
import com.miraprep.user.UserRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.UserRequestPostProcessor;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(classes = BusinessApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ReportShareApiIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private UserRepository userRepository;
    @Autowired private ResumeRepository resumeRepository;
    @Autowired private InterviewSessionRepository sessionRepository;
    @Autowired private QuestionRepository questionRepository;
    @Autowired private InterviewMessageRepository messageRepository;
    @MockBean private ObjectStorageService objectStorageService;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add(
                "spring.datasource.url",
                () -> "jdbc:h2:mem:report-share;MODE=MySQL;DB_CLOSE_DELAY=-1");
        registry.add("spring.datasource.driver-class-name", () -> "org.h2.Driver");
        registry.add("spring.datasource.username", () -> "sa");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.data.redis.repositories.enabled", () -> false);
        registry.add("app.internal-token", () -> "test-internal-token");
        registry.add("app.share.base-url", () -> "https://miraprep.test/");
    }

    @BeforeEach
    void signPrivateAudioObjects() throws Exception {
        org.mockito.Mockito.when(objectStorageService.signedDownloadUrl(
                        org.mockito.ArgumentMatchers.anyString()))
                .thenReturn("https://minio.test/signed-audio");
    }

    @Test
    void enablingShareYieldsAPublicLinkAndDisablingItKillsTheOldLinkForGood() throws Exception {
        User owner = createUser();
        InterviewSession session = gradedSession(owner);

        getShare(session.getId(), owner)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.enabled").value(false))
                .andExpect(jsonPath("$.data.shareToken").doesNotExist());

        String token = enableShare(session.getId(), owner, true)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.enabled").value(true))
                // 尾部斜杠不能带进链接里。
                .andExpect(jsonPath("$.data.shareUrl").exists())
                .andReturn()
                .getResponse()
                .getContentAsString()
                .transform(this::shareToken);
        assertThat(token).hasSizeGreaterThanOrEqualTo(32);

        mockMvc.perform(get("/api/v1/public/reports/{token}", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.grade").value("A"));

        // 重复开启是幂等的，不会把已经发出去的链接换掉。
        enableShare(session.getId(), owner, true)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.shareToken").value(token));

        enableShare(session.getId(), owner, false)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.enabled").value(false))
                .andExpect(jsonPath("$.data.shareToken").doesNotExist());
        mockMvc.perform(get("/api/v1/public/reports/{token}", token))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(40400));

        // 关掉再开会换一个新 token，老链接永久失效。
        String reissued = enableShare(session.getId(), owner, true)
                .andReturn()
                .getResponse()
                .getContentAsString()
                .transform(this::shareToken);
        assertThat(reissued).isNotEqualTo(token);
        mockMvc.perform(get("/api/v1/public/reports/{token}", token))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/public/reports/{token}", reissued))
                .andExpect(status().isOk());
    }

    @Test
    void publicViewIsAnonymousReadOnlyAndStripsEveryPieceOfPersonalData() throws Exception {
        User owner = createUser();
        InterviewSession session = gradedSession(owner);
        String token = enableShare(session.getId(), owner, true)
                .andReturn()
                .getResponse()
                .getContentAsString()
                .transform(this::shareToken);

        // 注意：请求上没有任何身份信息，公开页必须在未登录时也能打开。
        String body = mockMvc.perform(get("/api/v1/public/reports/{token}", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.grade").value("A"))
                .andExpect(jsonPath("$.data.totalScore").value(82))
                .andExpect(jsonPath("$.data.questions[0].text").exists())
                // 私有音频的签名地址是临时通行证，绝不能出现在公开视图里。
                .andExpect(jsonPath("$.data.questions[0].audioUrl").doesNotExist())
                // 会话 id 是本人后台的坐标，公开视图用 token 定位，不需要它。
                .andExpect(jsonPath("$.data.sessionId").doesNotExist())
                // JD 原文与自定义要求是本人输入，可能带公司或个人信息，整块丢弃。
                .andExpect(jsonPath("$.data.config.jdText").doesNotExist())
                .andExpect(jsonPath("$.data.config.customRequirements").doesNotExist())
                .andExpect(jsonPath("$.data.config.difficulty").value("medium"))
                .andReturn()
                .getResponse()
                // MockMvc 默认按 ISO-8859-1 解码，不指定 UTF-8 的话中文断言全是乱码。
                .getContentAsString(java.nio.charset.StandardCharsets.UTF_8);

        assertThat(body)
                .doesNotContain(owner.getEmail())
                .doesNotContain("李雷")
                .doesNotContain("13800138000")
                .doesNotContain("lilei.private@example.com")
                .doesNotContain("110101199003072316")
                .contains("[已隐藏]");
        // 脱敏不能把正文吃掉：非隐私内容必须原样保留。
        assertThat(body).contains("我用数据库事务和行锁保证幂等");
        // 考察点同样要脱敏，但只打掉隐私那一段。
        assertThat(body).contains("[已隐藏] 的项目深度");
    }

    /**
     * 分享链接是发给外人的，别人会拿浏览器插件、链接预览、手滑的 POST 去撞它。这些都是客户端
     * 错误，必须是 4xx；掉进兜底分支变成 500 的话，日志里会堆一串假的「服务器错误」。
     */
    @Test
    void clientMistakesOnPublicAndOwnerEndpointsAreFourHundredsNotFiveHundreds() throws Exception {
        User owner = createUser();
        InterviewSession session = gradedSession(owner);

        // 公开分享页只读，非 GET 是 405。
        mockMvc.perform(post("/api/v1/public/reports/{token}", "whatever"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.code").value(40500));

        // 路径参数类型不匹配（被截断的链接、被改过的地址）。
        mockMvc.perform(get("/api/v1/reports/{id}/export", "abc").with(as(owner)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));

        // 畸形和空请求体。
        mockMvc.perform(post("/api/v1/reports/{id}/share", session.getId())
                        .with(as(owner))
                        .contentType("application/json")
                        .content("{not json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
        mockMvc.perform(post("/api/v1/reports/{id}/share", session.getId())
                        .with(as(owner))
                        .contentType("application/json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
    }

    @Test
    void nobodyElseCanFlipTheShareSwitchOnSomeoneElsesReport() throws Exception {
        User owner = createUser();
        User other = createUser();
        InterviewSession session = gradedSession(owner);

        enableShare(session.getId(), other, true)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(40300));
        getShare(session.getId(), other)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(40300));
        enableShare(999_999L, owner, true)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(40400));
        mockMvc.perform(get("/api/v1/public/reports/{token}", "not-a-real-token"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(40400));
        // 链接被截断（token 整段丢失）也要是干净的 404，不能是 500。
        mockMvc.perform(get("/api/v1/public/reports/"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(40400));
        // 分享开关必须要求登录。
        mockMvc.perform(post("/api/v1/reports/{id}/share", session.getId())
                        .contentType("application/json")
                        .content("{\"enabled\":true}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void historyTrendCoversOnlyTheRequestedRoleAndSkipsAbandonedSessions() throws Exception {
        User owner = createUser();
        User other = createUser();
        Instant base = Instant.parse("2026-07-01T10:00:00Z");

        gradedSession(owner, base, "backend", "Java 工程师", 72, "B", false);
        gradedSession(owner, base.plus(1, ChronoUnit.DAYS), "backend", "Java 工程师", 84, "A", false);
        // partial（中途放弃）不进趋势，分数不可比。
        gradedSession(owner, base.plus(2, ChronoUnit.DAYS), "backend", "Java 工程师", 91, "S", true);
        // 别的岗位不进这条折线。
        gradedSession(owner, base.plus(3, ChronoUnit.DAYS), "frontend", "前端工程师", 65, "C", false);
        // 别人的报告永远不进。
        gradedSession(other, base.plus(4, ChronoUnit.DAYS), "backend", "Java 工程师", 99, "S", false);

        mockMvc.perform(get("/api/v1/stats/history")
                        .param("jobDirection", "backend")
                        .param("jobTitle", "Java 工程师")
                        .with(as(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.points.length()").value(2))
                // 按结束时间正序，前端拿到就能直接画。
                .andExpect(jsonPath("$.data.points[0].score").value(72))
                .andExpect(jsonPath("$.data.points[0].grade").value("B"))
                .andExpect(jsonPath("$.data.points[1].score").value(84))
                .andExpect(jsonPath("$.data.points[1].date").value("2026-07-02T10:00:00Z"));

        // 不带筛选就是「我的全部完整报告」。
        mockMvc.perform(get("/api/v1/stats/history").with(as(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.points.length()").value(3));

        mockMvc.perform(get("/api/v1/stats/history")
                        .param("jobTitle", "不存在的岗位")
                        .with(as(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.points.length()").value(0));
    }

    @Test
    void openApiDocumentsTheShareAndHistoryEndpoints() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/v1/reports/{sessionId}/share']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/public/reports/{shareToken}']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/stats/history']").exists());
    }

    private String shareToken(String body) {
        try {
            JsonNode data = objectMapper.readTree(body).path("data");
            String url = data.path("shareUrl").asText();
            assertThat(url).startsWith("https://miraprep.test/public/reports/");
            return data.path("shareToken").asText();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private ResultActions enableShare(long sessionId, User actor, boolean enabled)
            throws Exception {
        return mockMvc.perform(post("/api/v1/reports/{id}/share", sessionId)
                .with(as(actor))
                .contentType("application/json")
                .content("{\"enabled\":%s}".formatted(enabled)));
    }

    private ResultActions getShare(long sessionId, User actor) throws Exception {
        return mockMvc.perform(get("/api/v1/reports/{id}/share", sessionId).with(as(actor)));
    }

    private User createUser() {
        User user = new User();
        user.setEmail("share-" + UUID.randomUUID() + "@example.com");
        user.setPasswordHash("test-only");
        user.setNickname("雷子哥");
        return userRepository.save(user);
    }

    private InterviewSession gradedSession(User owner) throws Exception {
        return gradedSession(
                owner, Instant.parse("2026-07-20T10:30:00Z"), "backend", "Java 工程师", 82, "A", false);
    }

    private InterviewSession gradedSession(
            User owner,
            Instant endedAt,
            String jobDirection,
            String jobTitle,
            int score,
            String grade,
            boolean partial)
            throws Exception {
        Resume resume = new Resume();
        resume.setUser(owner);
        resume.setFileUrl("resumes/%s.pdf".formatted(UUID.randomUUID()));
        resume.setFileName("简历.pdf");
        resume.setFileSize(1024);
        resume.setParseStatus(ResumeParseStatus.SUCCESS);
        resume.setParsedJson(Map.of(
                "basics",
                Map.of(
                        "name", "李雷",
                        "email", "lilei.private@example.com",
                        "phone", "13800138000")));
        resumeRepository.save(resume);

        InterviewSession session = new InterviewSession();
        session.setUser(owner);
        session.setResume(resume);
        session.setJobDirection(jobDirection);
        session.setJobTitle(jobTitle);
        session.setJdText("岗位联系人 李雷 13800138000");
        session.setDifficulty(InterviewDifficulty.MEDIUM);
        session.setTypes(List.of("technical"));
        session.setDurationMin(45);
        session.setCustomRequirements("请联系 lilei.private@example.com");
        session.setInterviewerStyle(InterviewerStyle.BALANCED);
        session.setStatus(partial ? InterviewStatus.ABORTED : InterviewStatus.COMPLETED);
        session.setOutlineStatus(OutlineStatus.READY);
        session.setGradingStatus(GradingStatus.PENDING);
        session.setStartedAt(endedAt.minus(10, ChronoUnit.MINUTES));
        session.setEndedAt(endedAt);
        sessionRepository.save(session);

        Question question = new Question();
        question.setSession(session);
        question.setPhase(InterviewPhase.DOMAIN_ASSESSMENT);
        question.setText("请介绍你在 MiraPrep 中做的可靠回调。");
        // 考察点由大模型围绕简历生成（见 outline 提示词），复述出姓名和联系方式是常态，
        // 所以它和正文一样是隐私字段，不能因为「只是几个标签」就漏掉脱敏。
        question.setFocusPoints(List.of("李雷 的项目深度", "可联系 lilei.private@example.com"));
        question.setSortOrder(1);
        question.setThinkSeconds(12);
        question.setAnswerSeconds(88);
        question.setSuggestedSeconds(120);
        questionRepository.save(question);

        InterviewMessage answer = new InterviewMessage();
        answer.setSession(session);
        answer.setRole(MessageRole.CANDIDATE);
        answer.setContent("我叫李雷，身份证 110101199003072316，我用数据库事务和行锁保证幂等。");
        answer.setAudioUrl("audio/%d/%d/answer.mp3".formatted(owner.getId(), session.getId()));
        answer.setPhase(question.getPhase());
        answer.setQuestion(question);
        answer.setSeq(2);
        messageRepository.save(answer);

        mockMvc.perform(post("/api/v1/internal/interviews/{id}/grade-result", session.getId())
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType("application/json")
                        .content(gradePayload(question.getId(), score, grade, partial)))
                .andExpect(status().isOk());
        return session;
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
                  "summary":"李雷同学总体表现稳定，可通过 lilei.private@example.com 联系。",
                  "highlights":["项目讲解清楚"],
                  "weaknesses":["岗位匹配度可提升"],
                  "partial":%s,
                  "questionReviews":[{
                    "questionId":%d,
                    "score":8,
                    "referenceAnswer":"可结合项目说明事务与行锁。",
                    "suggestions":["先说明风险，再说明方案"],
                    "followUpChain":[{
                      "question":"如果并发到达呢？",
                      "answer":"我是李雷，用行锁串行化，电话 13800138000。",
                      "answerSeconds":27,
                      "referenceAnswer":"使用行锁配合唯一约束。",
                      "suggestions":["说明事务边界"]
                    }]
                  }]
                }
                """
                .formatted(grade, score, partial, questionId);
    }

    private UserRequestPostProcessor as(User user) {
        return user(Long.toString(user.getId()));
    }
}
