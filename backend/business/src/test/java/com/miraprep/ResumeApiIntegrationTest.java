package com.miraprep;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.miraprep.client.AiServiceClient;
import com.miraprep.resume.ObjectStorageService;
import java.util.Arrays;
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
class ResumeApiIntegrationTest {

    @Autowired private MockMvc mockMvc;

    @MockBean private ObjectStorageService objectStorageService;
    @MockBean private AiServiceClient aiServiceClient;

    @BeforeEach
    void prepareObjectStorage() throws Exception {
        when(objectStorageService.signedDownloadUrl(anyString())).thenReturn("http://minio.test/signed-download");
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:h2:mem:resume-api;MODE=MySQL;DB_CLOSE_DELAY=-1");
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
    void authenticatedUserCanUploadPdfAndReceivesPendingResume() throws Exception {
        String accessToken = registerAndGetAccessToken();
        MockMultipartFile file = new MockMultipartFile(
                "file", "candidate.pdf", "application/pdf", "%PDF-1.7\nresume".getBytes());

        mockMvc.perform(multipart("/api/v1/resumes").file(file).header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.fileName").value("candidate.pdf"))
                .andExpect(jsonPath("$.data.fileSize").value(file.getSize()))
                .andExpect(jsonPath("$.data.parseStatus").value("pending"));
        verify(objectStorageService).store(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq(file.getSize()),
                org.mockito.ArgumentMatchers.eq("application/pdf"));
        verify(aiServiceClient).requestResumeParse(org.mockito.ArgumentMatchers.argThat(request ->
                request.fileName().equals("candidate.pdf")
                        && request.signedUrl().equals("http://minio.test/signed-download")
                        && request.mimeType().equals("application/pdf")));
    }

    @Test
    void uploadRejectsUnsupportedFilesAndFilesOverTenMegabytes() throws Exception {
        String accessToken = registerAndGetAccessToken();
        MockMultipartFile textFile = new MockMultipartFile("file", "notes.txt", "text/plain", "not a resume".getBytes());
        mockMvc.perform(multipart("/api/v1/resumes").file(textFile).header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40001));

        MockMultipartFile disguisedFile = new MockMultipartFile(
                "file", "malware.pdf", "application/pdf", "not actually a PDF".getBytes());
        mockMvc.perform(multipart("/api/v1/resumes").file(disguisedFile).header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40001));

        byte[] tooLarge = new byte[10 * 1024 * 1024 + 1];
        Arrays.fill(tooLarge, (byte) 1);
        MockMultipartFile largePdf = new MockMultipartFile("file", "large.pdf", "application/pdf", tooLarge);
        mockMvc.perform(multipart("/api/v1/resumes").file(largePdf).header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40002));
    }

    @Test
    void defaultIsMutuallyExclusiveAndDeleteHidesOnlyTheOwnersResume() throws Exception {
        String accessToken = registerAndGetAccessToken();
        long firstId = upload(accessToken, "first.pdf");
        long secondId = upload(accessToken, "second.pdf");

        mockMvc.perform(patch("/api/v1/resumes/{id}", secondId)
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType("application/json")
                        .content("{\"isDefault\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isDefault").value(true));

        mockMvc.perform(get("/api/v1/resumes").header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(2))
                .andExpect(jsonPath("$.data.items[0].id").value(secondId))
                .andExpect(jsonPath("$.data.items[0].isDefault").value(true));

        mockMvc.perform(delete("/api/v1/resumes/{id}", secondId).header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/v1/resumes").header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(firstId))
                .andExpect(jsonPath("$.data.items[0].isDefault").value(true));
    }

    @Test
    void deletingTheDefaultSelectsTheMostRecentlyUploadedRemainingResume() throws Exception {
        String accessToken = registerAndGetAccessToken();
        long oldestId = upload(accessToken, "oldest.pdf");
        long middleId = upload(accessToken, "middle.pdf");
        long newestId = upload(accessToken, "newest.pdf");

        mockMvc.perform(patch("/api/v1/resumes/{id}", oldestId)
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType("application/json")
                        .content("{\"isDefault\":true}"))
                .andExpect(status().isOk());
        mockMvc.perform(delete("/api/v1/resumes/{id}", oldestId).header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/v1/resumes").header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].id").value(newestId))
                .andExpect(jsonPath("$.data.items[0].isDefault").value(true))
                .andExpect(jsonPath("$.data.items[1].id").value(middleId));
    }

    @Test
    void renameRejectsAWhitespaceOnlyFileName() throws Exception {
        String accessToken = registerAndGetAccessToken();
        long resumeId = upload(accessToken, "named.pdf");

        mockMvc.perform(patch("/api/v1/resumes/{id}", resumeId)
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType("application/json")
                        .content("{\"fileName\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
    }

    @Test
    void parseCallbackRequiresInternalTokenAndPersistsSuccessfulResult() throws Exception {
        String accessToken = registerAndGetAccessToken();
        long resumeId = upload(accessToken, "callback.pdf");
        String body = "{\"status\":\"success\",\"pageCount\":2,\"parsedJson\":{\"name\":\"Mira\"}}";

        mockMvc.perform(post("/api/v1/internal/resumes/{id}/parse-result", resumeId)
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(40300));

        mockMvc.perform(post("/api/v1/internal/resumes/{id}/parse-result", resumeId)
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0));

        mockMvc.perform(get("/api/v1/resumes/{id}", resumeId).header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.parseStatus").value("success"))
                .andExpect(jsonPath("$.data.pageCount").value(2))
                .andExpect(jsonPath("$.data.parsedJson.name").value("Mira"))
                .andExpect(jsonPath("$.data.downloadUrl").value("http://minio.test/signed-download"));
    }

    @Test
    void duplicateOrOutOfOrderParseCallbacksDoNotOverwriteTheFirstResult() throws Exception {
        String accessToken = registerAndGetAccessToken();
        long resumeId = upload(accessToken, "idempotent.pdf");
        String success = "{\"status\":\"success\",\"pageCount\":1,\"parsedJson\":{\"name\":\"Mira\"}}";
        String lateFailure = "{\"status\":\"failed\",\"error\":\"late callback\"}";

        mockMvc.perform(post("/api/v1/internal/resumes/{id}/parse-result", resumeId)
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType("application/json")
                        .content(success))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/internal/resumes/{id}/parse-result", resumeId)
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType("application/json")
                        .content(lateFailure))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/resumes/{id}", resumeId).header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.parseStatus").value("success"))
                .andExpect(jsonPath("$.data.parsedJson.name").value("Mira"));
    }

    @Test
    void aUserCannotReadAnotherUsersResume() throws Exception {
        String ownerToken = registerAndGetAccessToken();
        long resumeId = upload(ownerToken, "private.pdf");
        String otherUserToken = registerAndGetAccessToken();

        mockMvc.perform(get("/api/v1/resumes/{id}", resumeId).header("Authorization", "Bearer " + otherUserToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(40400));
    }

    @Test
    void whenPersistFailsAfterStorageTheObjectIsCleanedUp() throws Exception {
        String accessToken = registerAndGetAccessToken();
        // 文件名超过 file_name 列长度(512)，对象已上传后 DB 插入失败 → 触发孤儿对象清理。
        String overlongName = "a".repeat(600) + ".pdf";
        MockMultipartFile file = new MockMultipartFile(
                "file", overlongName, "application/pdf", "%PDF-1.7\nresume".getBytes());

        mockMvc.perform(multipart("/api/v1/resumes").file(file).header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value(50000));

        // 存储写入成功但入库失败：应删除已上传的孤儿对象。
        verify(objectStorageService).delete(anyString());
    }

    @Test
    void resumeEndpointsArePublishedInOpenApi() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/v1/resumes'].post").exists())
                .andExpect(jsonPath("$.paths['/api/v1/resumes/{id}'].patch").exists())
                .andExpect(jsonPath("$.paths['/api/v1/internal/resumes/{id}/parse-result'].post").exists());
    }

    private String registerAndGetAccessToken() throws Exception {
        String email = "resume-" + UUID.randomUUID() + "@example.com";
        MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("{\"email\":\"%s\",\"password\":\"safe-password-123\",\"code\":\"123456\"}"
                                .formatted(email)))
                .andExpect(status().isOk())
                .andReturn();
        return com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.data.accessToken");
    }

    private long upload(String accessToken, String fileName) throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", fileName, "application/pdf", "%PDF-1.7\nresume".getBytes());
        MvcResult result = mockMvc.perform(multipart("/api/v1/resumes").file(file).header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andReturn();
        Number id = com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.data.id");
        return id.longValue();
    }
}
