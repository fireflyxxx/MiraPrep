package com.miraprep;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.miraprep.client.AiServiceClient;
import com.miraprep.resume.ObjectStorageService;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
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

@SpringBootTest(classes = BusinessApplication.class)
@AutoConfigureMockMvc
class ResumeUploadRateLimitIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @MockBean private ObjectStorageService objectStorageService;
    @MockBean private AiServiceClient aiServiceClient;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:h2:mem:resume-rate-limit;MODE=MySQL;DB_CLOSE_DELAY=-1");
        registry.add("spring.datasource.driver-class-name", () -> "org.h2.Driver");
        registry.add("spring.datasource.username", () -> "sa");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.data.redis.repositories.enabled", () -> false);
        registry.add("app.auth.jwt-secret", () -> "test-jwt-secret-that-is-long-enough-for-hmac-sha256");
        registry.add("app.auth.verification.fixed-code", () -> "123456");
        registry.add("app.auth.token-store", () -> "memory");
        registry.add("app.auth.rate-limiter", () -> "memory");
        registry.add("app.resume.upload-max-attempts", () -> "1");
        registry.add("app.resume.upload-window", () -> "60");
    }

    @BeforeEach
    void prepareObjectStorage() throws Exception {
        org.mockito.Mockito.when(objectStorageService.signedDownloadUrl(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn("http://minio.test/signed-download");
    }

    @Test
    void rejectsUploadsAfterThePerUserLimitIsReached() throws Exception {
        String accessToken = registerAndGetAccessToken();

        mockMvc.perform(uploadRequest(accessToken, "first.pdf"))
                .andExpect(status().isOk());
        mockMvc.perform(uploadRequest(accessToken, "second.pdf"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value(42902));
    }

    @Test
    void aFailedStorageUploadRefundsTheRateLimitTokenSoTheUserCanRetry() throws Exception {
        String accessToken = registerAndGetAccessToken();
        // 第一次 store 抛异常（模拟 MinIO 抖动），第二次正常。max-attempts=1，
        // 若失败没退还令牌，第二次会被 429 挡下。
        org.mockito.Mockito.doThrow(new RuntimeException("minio down"))
                .doNothing()
                .when(objectStorageService)
                .store(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.any());

        mockMvc.perform(uploadRequest(accessToken, "first.pdf"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value(50000));

        // 令牌已退还：同一窗口内的重试应当成功，而不是 429。
        mockMvc.perform(uploadRequest(accessToken, "retry.pdf"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0));
    }

    @Test
    void rejectedInvalidFileDoesNotConsumeTheUsersUploadQuota() throws Exception {
        String accessToken = registerAndGetAccessToken();
        MockMultipartFile invalid = new MockMultipartFile("file", "not-a-resume.txt", "text/plain", "x".getBytes());

        mockMvc.perform(multipart("/api/v1/resumes").file(invalid).header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40001));
        mockMvc.perform(uploadRequest(accessToken, "valid.pdf"))
                .andExpect(status().isOk());
    }

    private String registerAndGetAccessToken() throws Exception {
        String email = "rate-" + UUID.randomUUID() + "@example.com";
        MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("{\"email\":\"%s\",\"password\":\"safe-password-123\",\"code\":\"123456\"}"
                                .formatted(email)))
                .andExpect(status().isOk())
                .andReturn();
        return com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.data.accessToken");
    }

    private org.springframework.test.web.servlet.RequestBuilder uploadRequest(
            String accessToken, String fileName) {
        MockMultipartFile file = new MockMultipartFile(
                "file", fileName, "application/pdf", "%PDF-1.7\nresume".getBytes());
        return multipart("/api/v1/resumes").file(file).header("Authorization", "Bearer " + accessToken);
    }
}
