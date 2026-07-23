package com.miraprep;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.miraprep.client.AiServiceClient;
import com.miraprep.domain.InterviewSession;
import com.miraprep.domain.InterviewStatus;
import com.miraprep.interview.InterviewSessionRepository;
import com.miraprep.interview.QuestionRepository;
import com.miraprep.resume.ObjectStorageService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

@SpringBootTest(classes = BusinessApplication.class)
@AutoConfigureMockMvc
class InterviewMessageApiIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private InterviewSessionRepository interviewSessionRepository;
    @Autowired private QuestionRepository questionRepository;

    @MockBean private ObjectStorageService objectStorageService;
    @MockBean private AiServiceClient aiServiceClient;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:h2:mem:interview-messages;MODE=MySQL;DB_CLOSE_DELAY=-1");
        registry.add("spring.datasource.driver-class-name", () -> "org.h2.Driver");
        registry.add("spring.datasource.username", () -> "sa");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.data.redis.repositories.enabled", () -> false);
        registry.add("app.auth.jwt-secret", () -> "test-jwt-secret-that-is-long-enough-for-hmac-sha256");
        registry.add("app.auth.verification.fixed-code", () -> "123456");
        registry.add("app.auth.token-store", () -> "memory");
        registry.add("app.auth.rate-limiter", () -> "memory");
        registry.add("app.internal-token", () -> "test-internal-token");
    }

    @Test
    void callbackPersistsMessagesIdempotentlyAndReadReturnsOrderedIncrementalHistory() throws Exception {
        String token = registerAndGetAccessToken();
        long sessionId = createInterview(token, uploadResume(token, "messages.pdf"));

        postMessage(sessionId, messageBody("candidate", "second", 2))
                .andExpect(status().isOk());
        postMessage(sessionId, messageBody("interviewer", "first", 1))
                .andExpect(status().isOk());
        postMessage(sessionId, messageBody("interviewer", "first", 1))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/interviews/{id}/messages", sessionId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items", hasSize(2)))
                .andExpect(jsonPath("$.data.items[0].role").value("interviewer"))
                .andExpect(jsonPath("$.data.items[0].content").value("first"))
                .andExpect(jsonPath("$.data.items[0].phase").value("self_intro"))
                .andExpect(jsonPath("$.data.items[0].seq").value(1))
                .andExpect(jsonPath("$.data.items[0].createdAt").isNotEmpty())
                .andExpect(jsonPath("$.data.items[1].role").value("candidate"))
                .andExpect(jsonPath("$.data.items[1].seq").value(2));

        mockMvc.perform(get("/api/v1/interviews/{id}/messages", sessionId)
                        .header("Authorization", "Bearer " + token)
                        .param("afterSeq", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items", hasSize(1)))
                .andExpect(jsonPath("$.data.items[0].seq").value(2));

        InterviewSession session = interviewSessionRepository.findById(sessionId).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(session.getStatus()).isEqualTo(InterviewStatus.ONGOING);
        org.assertj.core.api.Assertions.assertThat(session.getStartedAt()).isNotNull();
    }

    @Test
    void readRejectsAnotherUserAndMissingAuthentication() throws Exception {
        String ownerToken = registerAndGetAccessToken();
        long sessionId = createInterview(ownerToken, uploadResume(ownerToken, "private-messages.pdf"));
        postMessage(sessionId, messageBody("interviewer", "private", 1))
                .andExpect(status().isOk());
        String otherToken = registerAndGetAccessToken();

        mockMvc.perform(get("/api/v1/interviews/{id}/messages", sessionId)
                        .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(40300));
        mockMvc.perform(get("/api/v1/interviews/{id}/messages", sessionId))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void callbackRequiresInternalTokenAndValidMessageBody() throws Exception {
        String token = registerAndGetAccessToken();
        long sessionId = createInterview(token, uploadResume(token, "validated-messages.pdf"));

        mockMvc.perform(post("/api/v1/internal/interviews/{id}/messages", sessionId)
                        .contentType("application/json")
                        .content(messageBody("interviewer", "hello", 1)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(40300));
        postMessage(sessionId, messageBody("system", "hello", 1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
        postMessage(sessionId, messageBody("candidate", " ", 0))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
    }

    @Test
    void callbackAcceptsTheExactT040GreetingPayload() throws Exception {
        String token = registerAndGetAccessToken();
        long sessionId = createInterview(token, uploadResume(token, "greeting-message.pdf"));

        postMessage(sessionId, """
                {
                  "role": "interviewer",
                  "content": "你好，我是本次的面试官。",
                  "phase": "GREETING",
                  "questionId": null,
                  "seq": 1
                }
                """).andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/interviews/{id}/messages", sessionId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].phase").value("greeting"))
                .andExpect(jsonPath("$.data.items[0].questionId").doesNotExist())
                .andExpect(jsonPath("$.data.items[0].audioUrl").doesNotExist());
    }

    @Test
    void endedSessionIsSealedAgainstNewMessages() throws Exception {
        String token = registerAndGetAccessToken();
        long sessionId = createInterview(token, uploadResume(token, "sealed-messages.pdf"));
        postMessage(sessionId, messageBody("interviewer", "before end", 1))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/interviews/{id}/end", sessionId)
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("{\"reason\":\"completed\"}"))
                .andExpect(status().isOk());

        postMessage(sessionId, messageBody("candidate", "too late", 2))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));

        mockMvc.perform(get("/api/v1/interviews/{id}/messages", sessionId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items", hasSize(1)))
                .andExpect(jsonPath("$.data.items[0].content").value("before end"));
    }

    @Test
    void writeLinksAValidQuestionAndRejectsAQuestionFromOutsideTheSession() throws Exception {
        String token = registerAndGetAccessToken();
        long sessionId = createInterview(token, uploadResume(token, "linked-question.pdf"));
        postOutlineCallback(sessionId, """
                {"status":"ready","questions":[
                  {"phase":"self_intro","text":"Introduce yourself","focusPoints":[],"order":1,"suggestedSeconds":60}
                ]}
                """).andExpect(status().isOk());
        long questionId = questionRepository.findBySessionIdOrderBySortOrder(sessionId).get(0).getId();

        postMessage(sessionId, messageBodyWithQuestion("candidate", "answer", 1, questionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questionId").value((int) questionId));

        mockMvc.perform(get("/api/v1/interviews/{id}/messages", sessionId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].questionId").value((int) questionId));

        postMessage(sessionId, messageBodyWithQuestion("candidate", "wrong", 2, 999999L))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
    }

    @Test
    void writeRejectsMissingSessionAndReadRejectsNegativeAfterSeqAndMissingSession() throws Exception {
        String token = registerAndGetAccessToken();
        long sessionId = createInterview(token, uploadResume(token, "guards.pdf"));
        postMessage(sessionId, messageBody("interviewer", "hi", 1)).andExpect(status().isOk());

        postMessage(999999L, messageBody("interviewer", "nobody", 1))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(40400));

        mockMvc.perform(get("/api/v1/interviews/{id}/messages", sessionId)
                        .header("Authorization", "Bearer " + token)
                        .param("afterSeq", "-1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));

        mockMvc.perform(get("/api/v1/interviews/{id}/messages", 999999L)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(40400));
    }

    private ResultActions postOutlineCallback(long sessionId, String body) throws Exception {
        return mockMvc.perform(post("/api/v1/internal/interviews/{id}/outline-result", sessionId)
                .header("X-Internal-Token", "test-internal-token")
                .contentType("application/json")
                .content(body));
    }

    private String messageBodyWithQuestion(String role, String content, int seq, long questionId) {
        return """
                {
                  "role": "%s",
                  "content": "%s",
                  "phase": "self_intro",
                  "questionId": %d,
                  "seq": %d
                }
                """.formatted(role, content, questionId, seq);
    }

    private ResultActions postMessage(long sessionId, String body) throws Exception {
        return mockMvc.perform(post("/api/v1/internal/interviews/{id}/messages", sessionId)
                .header("X-Internal-Token", "test-internal-token")
                .contentType("application/json")
                .content(body));
    }

    private String messageBody(String role, String content, int seq) {
        return """
                {
                  "role": "%s",
                  "content": "%s",
                  "phase": "self_intro",
                  "audioUrl": "https://example.test/audio/%d",
                  "seq": %d
                }
                """.formatted(role, content, seq, seq);
    }

    private String registerAndGetAccessToken() throws Exception {
        String email = "messages-" + UUID.randomUUID() + "@example.com";
        MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("{\"email\":\"%s\",\"password\":\"safe-password-123\",\"code\":\"123456\"}"
                                .formatted(email)))
                .andExpect(status().isOk())
                .andReturn();
        return JsonPath.read(result.getResponse().getContentAsString(), "$.data.accessToken");
    }

    private long uploadResume(String token, String fileName) throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", fileName, "application/pdf", "%PDF-1.7\nresume".getBytes());
        MvcResult result = mockMvc.perform(multipart("/api/v1/resumes")
                        .file(file)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        Number id = JsonPath.read(result.getResponse().getContentAsString(), "$.data.id");
        return id.longValue();
    }

    private long createInterview(String token, long resumeId) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/interviews")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("""
                                {
                                  "resumeId": %d,
                                  "jobDirection": "backend",
                                  "jobTitle": "Java engineer",
                                  "difficulty": "medium",
                                  "types": ["technical"],
                                  "durationMin": 30,
                                  "interviewerStyle": "balanced",
                                  "voiceEnabled": false
                                }
                                """.formatted(resumeId)))
                .andExpect(status().isOk())
                .andReturn();
        Number id = JsonPath.read(result.getResponse().getContentAsString(), "$.data.sessionId");
        return id.longValue();
    }
}
