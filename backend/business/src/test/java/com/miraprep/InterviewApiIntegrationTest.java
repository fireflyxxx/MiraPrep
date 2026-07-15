package com.miraprep;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.miraprep.client.AiServiceClient;
import com.miraprep.domain.GradingStatus;
import com.miraprep.domain.InterviewSession;
import com.miraprep.domain.InterviewStatus;
import com.miraprep.interview.InterviewSessionRepository;
import com.miraprep.interview.InterviewService;
import com.miraprep.resume.ObjectStorageService;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(classes = BusinessApplication.class)
@AutoConfigureMockMvc
class InterviewApiIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private InterviewSessionRepository interviewSessionRepository;

    @MockBean private ObjectStorageService objectStorageService;
    @MockBean private AiServiceClient aiServiceClient;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:h2:mem:interview-api;MODE=MySQL;DB_CLOSE_DELAY=-1");
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

    @BeforeEach
    void prepareObjectStorage() throws Exception {
        when(objectStorageService.signedDownloadUrl(anyString())).thenReturn("http://minio.test/resume");
    }

    @Test
    void interviewEndpointsRequireAuthenticationAndValidateTheCreateRequest() throws Exception {
        mockMvc.perform(post("/api/v1/interviews")
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isUnauthorized());

        String token = registerAndGetAccessToken();
        mockMvc.perform(post("/api/v1/interviews")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
    }

    @Test
    void authenticatedUserCanCreateInterviewAndTriggerOutlineGeneration() throws Exception {
        String token = registerAndGetAccessToken();
        long resumeId = uploadResume(token, "interview.pdf");

        MvcResult result = mockMvc.perform(post("/api/v1/interviews")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(createBody(resumeId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.sessionId").isNumber())
                .andExpect(jsonPath("$.data.outlineStatus").value("pending"))
                .andReturn();

        Number sessionId = JsonPath.read(result.getResponse().getContentAsString(), "$.data.sessionId");
        verify(aiServiceClient).requestInterviewOutline(org.mockito.ArgumentMatchers.argThat(request ->
                request.sessionId().equals(sessionId.longValue())
                        && request.config().jobDirection().equals("backend")
                        && request.config().jobTitle().equals("Java engineer")
                        && request.config().difficulty().equals("medium")
                        && request.config().types().equals(java.util.List.of("technical", "project"))
                        && request.config().durationMin() == 45
                        && request.config().interviewerStyle().equals("balanced")
                        && request.resume().parsedJson().isEmpty()));
    }

    @Test
    void missingJobTitleUsesTheTrimmedJobDirectionConsistently() throws Exception {
        String token = registerAndGetAccessToken();
        long resumeId = uploadResume(token, "trimmed-title.pdf");
        String body = """
                {
                  "resumeId": %d,
                  "jobDirection": "  backend  ",
                  "difficulty": "medium",
                  "types": ["technical"],
                  "durationMin": 30,
                  "interviewerStyle": "balanced",
                  "voiceEnabled": false
                }
                """.formatted(resumeId);

        mockMvc.perform(post("/api/v1/interviews")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isOk());

        verify(aiServiceClient).requestInterviewOutline(org.mockito.ArgumentMatchers.argThat(request ->
                request.config().jobDirection().equals("backend")
                        && request.config().jobTitle().equals("backend")));
    }

    @Test
    void createRejectsMissingAndForeignResumesWithDistinctErrors() throws Exception {
        String ownerToken = registerAndGetAccessToken();
        long ownerResumeId = uploadResume(ownerToken, "owner.pdf");
        String otherToken = registerAndGetAccessToken();

        mockMvc.perform(post("/api/v1/interviews")
                        .header("Authorization", "Bearer " + otherToken)
                        .contentType("application/json")
                        .content(createBody(ownerResumeId)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(40300));

        mockMvc.perform(post("/api/v1/interviews")
                        .header("Authorization", "Bearer " + otherToken)
                        .contentType("application/json")
                        .content(createBody(999999L)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(40400));
    }

    @Test
    void interviewEndpointsArePublishedInOpenApi() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/v1/interviews'].post").exists())
                .andExpect(jsonPath("$.paths['/api/v1/interviews'].get").exists())
                .andExpect(jsonPath("$.paths['/api/v1/interviews/{id}/status'].get").exists())
                .andExpect(jsonPath("$.paths['/api/v1/interviews/{id}/end'].post").exists())
                .andExpect(jsonPath("$.paths['/api/v1/internal/interviews/{id}/outline-result'].post").exists());
    }

    @Test
    void readyOutlineCallbackRequiresInternalTokenAndPersistsQuestionsIdempotently() throws Exception {
        String token = registerAndGetAccessToken();
        long sessionId = createInterview(token, uploadResume(token, "ready.pdf"));
        String callback = """
                {
                  "status": "ready",
                  "questions": [
                    {"phase":"domain_assessment","text":"Question two","focusPoints":["JPA"],"order":2,"suggestedSeconds":120},
                    {"phase":"self_intro","text":"Question one","focusPoints":["clarity"],"order":1,"suggestedSeconds":60}
                  ]
                }
                """;

        mockMvc.perform(post("/api/v1/internal/interviews/{id}/outline-result", sessionId)
                        .contentType("application/json")
                        .content(callback))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(40300));

        postOutlineCallback(sessionId, callback).andExpect(status().isOk());
        postOutlineCallback(sessionId, callback).andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/interviews/{id}/status", sessionId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sessionId").value(sessionId))
                .andExpect(jsonPath("$.data.status").value("created"))
                .andExpect(jsonPath("$.data.outlineStatus").value("ready"))
                .andExpect(jsonPath("$.data.questionCount").value(2));
    }

    @Test
    void aiOutlinePhaseVocabularyPersistsAllSixStages() throws Exception {
        String token = registerAndGetAccessToken();
        long sessionId = createInterview(token, uploadResume(token, "six-stages.pdf"));
        String callback = """
                {
                  "status": "ready",
                  "questions": [
                    {"phase":"SELF_INTRO","text":"Introduce yourself","focusPoints":["clarity"],"order":1,"suggestedSeconds":60},
                    {"phase":"RESUME_DEEP_DIVE","text":"Discuss MiraPrep","focusPoints":["depth"],"order":2,"suggestedSeconds":120},
                    {"phase":"DOMAIN_ASSESSMENT","text":"Design an API","focusPoints":["design"],"order":3,"suggestedSeconds":180},
                    {"phase":"BEHAVIORAL","text":"Describe a conflict","focusPoints":["communication"],"order":4,"suggestedSeconds":120},
                    {"phase":"CANDIDATE_QA","text":"What would you like to ask?","focusPoints":["curiosity"],"order":5,"suggestedSeconds":60},
                    {"phase":"CLOSING","text":"Closing","focusPoints":["completion"],"order":6,"suggestedSeconds":30}
                  ]
                }
                """;

        postOutlineCallback(sessionId, callback).andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/interviews/{id}/status", sessionId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.outlineStatus").value("ready"))
                .andExpect(jsonPath("$.data.questionCount").value(6));
    }

    @Test
    void createRejectsDurationOutsideProductOptionsBeforeSessionIsSaved() throws Exception {
        String token = registerAndGetAccessToken();
        long resumeId = uploadResume(token, "invalid-duration.pdf");
        long sessionCountBefore = interviewSessionRepository.count();
        String body = createBody(resumeId).replace("\"durationMin\": 45", "\"durationMin\": 60");

        mockMvc.perform(post("/api/v1/interviews")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));

        org.assertj.core.api.Assertions.assertThat(interviewSessionRepository.count())
                .isEqualTo(sessionCountBefore);
    }

    @Test
    void failedOutlineCallbackIsVisibleToPollingAndReadyRequiresQuestions() throws Exception {
        String token = registerAndGetAccessToken();
        long failedSessionId = createInterview(token, uploadResume(token, "failed.pdf"));

        postOutlineCallback(failedSessionId, "{\"status\":\"failed\",\"error\":\"model unavailable\"}")
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/interviews/{id}/status", failedSessionId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.outlineStatus").value("failed"))
                .andExpect(jsonPath("$.data.questionCount").value(0));

        long invalidSessionId = createInterview(token, uploadResume(token, "empty-ready.pdf"));
        postOutlineCallback(invalidSessionId, "{\"status\":\"ready\",\"questions\":[]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
    }

    @Test
    void outlineCallbackRejectsNullQuestionAsInvalidInputInsteadOfServerError() throws Exception {
        String token = registerAndGetAccessToken();
        long sessionId = createInterview(token, uploadResume(token, "null-question.pdf"));

        postOutlineCallback(sessionId, "{\"status\":\"ready\",\"questions\":[null]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
    }

    @Test
    void failedOutlineCallbackLogsTheAiFailureReason() throws Exception {
        String token = registerAndGetAccessToken();
        long sessionId = createInterview(token, uploadResume(token, "logged-failure.pdf"));
        ch.qos.logback.classic.Logger logger =
                (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(InterviewService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            postOutlineCallback(
                            sessionId,
                            "{\"status\":\"failed\",\"error\":\"model unavailable\"}")
                    .andExpect(status().isOk());

            org.assertj.core.api.Assertions.assertThat(appender.list)
                    .extracting(ILoggingEvent::getFormattedMessage)
                    .contains("Outline generation failed for interview %d: model unavailable".formatted(sessionId));
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    @Test
    void unknownOutlinePhaseMarksTheWholeOutlineFailedInsteadOfLeavingItPending() throws Exception {
        String token = registerAndGetAccessToken();
        long sessionId = createInterview(token, uploadResume(token, "unknown-phase.pdf"));

        postOutlineCallback(sessionId, """
                {"status":"ready","questions":[
                  {"phase":"coding","text":"Write code","focusPoints":[],"order":1,"suggestedSeconds":120}
                ]}
                """).andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/interviews/{id}/status", sessionId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.outlineStatus").value("failed"))
                .andExpect(jsonPath("$.data.questionCount").value(0));
    }

    @Test
    void statusPollingReturnsForbiddenForAnotherUsersSessionAndNotFoundForMissingSession() throws Exception {
        String ownerToken = registerAndGetAccessToken();
        long sessionId = createInterview(ownerToken, uploadResume(ownerToken, "private-session.pdf"));
        String otherToken = registerAndGetAccessToken();

        mockMvc.perform(get("/api/v1/interviews/{id}/status", sessionId)
                        .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(40300));

        mockMvc.perform(get("/api/v1/interviews/{id}/status", 999999L)
                        .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(40400));
    }

    @Test
    void historyListsOnlyOwnedSessionsWithPaginationFilterCountsAndDerivedFields() throws Exception {
        String ownerToken = registerAndGetAccessToken();
        long completedId = createInterview(ownerToken, uploadResume(ownerToken, "completed.pdf"));
        postOutlineCallback(completedId, """
                {"status":"ready","questions":[
                  {"phase":"self_intro","text":"One","focusPoints":[],"order":1,"suggestedSeconds":60},
                  {"phase":"domain_assessment","text":"Two","focusPoints":[],"order":2,"suggestedSeconds":120}
                ]}
                """).andExpect(status().isOk());
        InterviewSession completed = interviewSessionRepository.findById(completedId).orElseThrow();
        completed.setStatus(InterviewStatus.COMPLETED);
        completed.setStartedAt(Instant.parse("2026-07-16T00:00:00Z"));
        completed.setEndedAt(Instant.parse("2026-07-16T00:42:00Z"));
        completed.setGradingStatus(GradingStatus.PENDING);
        interviewSessionRepository.save(completed);

        long createdId = createInterview(ownerToken, uploadResume(ownerToken, "created.pdf"));
        String otherToken = registerAndGetAccessToken();
        createInterview(otherToken, uploadResume(otherToken, "other.pdf"));

        mockMvc.perform(get("/api/v1/interviews")
                        .header("Authorization", "Bearer " + ownerToken)
                        .param("page", "1")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(2))
                .andExpect(jsonPath("$.data.page").value(1))
                .andExpect(jsonPath("$.data.size").value(20))
                .andExpect(jsonPath("$.data.items[0].sessionId").value(createdId))
                .andExpect(jsonPath("$.data.items[0].questionCount").value(0))
                .andExpect(jsonPath("$.data.items[0].reportStatus").value("none"))
                .andExpect(jsonPath("$.data.items[1].sessionId").value(completedId))
                .andExpect(jsonPath("$.data.items[1].actualDurationSeconds").value(2520))
                .andExpect(jsonPath("$.data.items[1].questionCount").value(2))
                .andExpect(jsonPath("$.data.items[1].reportStatus").value("grading"))
                .andExpect(jsonPath("$.data.items[1].grade").value(nullValue()));

        mockMvc.perform(get("/api/v1/interviews")
                        .header("Authorization", "Bearer " + ownerToken)
                        .param("status", "completed")
                        .param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].sessionId").value(completedId))
                .andExpect(jsonPath("$.data.items[0].status").value("completed"));
    }

    @Test
    void manualEndAbortsSessionAndTriggersGradingOnlyOnce() throws Exception {
        String token = registerAndGetAccessToken();
        long sessionId = createInterview(token, uploadResume(token, "manual-end.pdf"));

        String body = "{\"reason\":\"manual\"}";
        mockMvc.perform(post("/api/v1/interviews/{id}/end", sessionId)
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sessionId").value(sessionId))
                .andExpect(jsonPath("$.data.status").value("aborted"))
                .andExpect(jsonPath("$.data.reportStatus").value("grading"))
                .andExpect(jsonPath("$.data.endedAt").isNotEmpty());

        mockMvc.perform(post("/api/v1/interviews/{id}/end", sessionId)
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("aborted"));

        verify(aiServiceClient, times(1)).requestInterviewGrade(
                org.mockito.ArgumentMatchers.argThat(request -> request.sessionId().equals(sessionId)));
        InterviewSession persisted = interviewSessionRepository.findById(sessionId).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(persisted.getGradingStatus()).isEqualTo(GradingStatus.PENDING);
        org.assertj.core.api.Assertions.assertThat(persisted.getEndedAt()).isNotNull();
    }

    @Test
    void timeoutAndCompletedReasonsCompleteSessionsWhileInvalidReasonIsRejected() throws Exception {
        String token = registerAndGetAccessToken();
        long timeoutId = createInterview(token, uploadResume(token, "timeout.pdf"));
        long completedId = createInterview(token, uploadResume(token, "completed-end.pdf"));

        endInterview(token, timeoutId, "timeout")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("completed"));
        endInterview(token, completedId, "completed")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("completed"));

        long invalidId = createInterview(token, uploadResume(token, "invalid-end.pdf"));
        endInterview(token, invalidId, "cancelled")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
    }

    @Test
    void endReturnsForbiddenForAnotherUsersSessionAndNotFoundForMissingSession() throws Exception {
        String ownerToken = registerAndGetAccessToken();
        long sessionId = createInterview(ownerToken, uploadResume(ownerToken, "owned-end.pdf"));
        String otherToken = registerAndGetAccessToken();

        endInterview(otherToken, sessionId, "manual")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(40300));
        endInterview(otherToken, 999999L, "manual")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(40400));
    }

    private String registerAndGetAccessToken() throws Exception {
        String email = "interview-" + UUID.randomUUID() + "@example.com";
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
                        .content(createBody(resumeId)))
                .andExpect(status().isOk())
                .andReturn();
        Number id = JsonPath.read(result.getResponse().getContentAsString(), "$.data.sessionId");
        return id.longValue();
    }

    private org.springframework.test.web.servlet.ResultActions postOutlineCallback(long sessionId, String body)
            throws Exception {
        return mockMvc.perform(post("/api/v1/internal/interviews/{id}/outline-result", sessionId)
                .header("X-Internal-Token", "test-internal-token")
                .contentType("application/json")
                .content(body));
    }

    private org.springframework.test.web.servlet.ResultActions endInterview(
            String token, long sessionId, String reason) throws Exception {
        return mockMvc.perform(post("/api/v1/interviews/{id}/end", sessionId)
                .header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .content("{\"reason\":\"%s\"}".formatted(reason)));
    }

    private String createBody(long resumeId) {
        return """
                {
                  "resumeId": %d,
                  "jobDirection": "backend",
                  "jobTitle": "Java engineer",
                  "jdText": "Build reliable APIs",
                  "difficulty": "medium",
                  "types": ["technical", "project"],
                  "durationMin": 45,
                  "customRequirements": "Focus on Spring",
                  "interviewerStyle": "balanced",
                  "voiceEnabled": false
                }
                """.formatted(resumeId);
    }
}
