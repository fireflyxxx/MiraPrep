package com.miraprep;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.miraprep.auth.AuthTokenStore;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Negative / boundary / state-transition test matrix for the auth backend.
 * Several tests below assert the *desired* behaviour on purpose: a failure here is a bug report,
 * not a flaky test.
 */
@SpringBootTest(classes = BusinessApplication.class)
@AutoConfigureMockMvc
class AuthEdgeCaseTest {

    private static final String PASSWORD = "safe-password-123";

    @Autowired private MockMvc mockMvc;
    @Autowired private AuthTokenStore tokenStore;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:h2:mem:auth-edge;MODE=MySQL;DB_CLOSE_DELAY=-1");
        registry.add("spring.datasource.driver-class-name", () -> "org.h2.Driver");
        registry.add("spring.datasource.username", () -> "sa");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.data.redis.repositories.enabled", () -> false);
        registry.add("app.auth.jwt-secret", () -> "test-jwt-secret-that-is-long-enough-for-hmac-sha256");
        registry.add("app.auth.token-store", () -> "memory");
        registry.add("app.auth.rate-limiter", () -> "memory");
        // NB: deliberately NOT setting a fixed-code, so the real store-backed code path is exercised.
    }

    // ---------- Group A: input validation (equivalence classes / boundaries) ----------

    @Test
    void registerRejectsPasswordShorterThanEightChars() throws Exception {
        seedCode("a-" + uniqueEmail(), "register", "111111");
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("{\"email\":\"boundary@example.com\",\"password\":\"short12\",\"code\":\"111111\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
    }

    @Test
    void registerRejectsInvalidEmail() throws Exception {
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("{\"email\":\"not-an-email\",\"password\":\"safe-password-123\",\"code\":\"111111\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
    }

    @Test
    void sendCodeRejectsUnknownScene() throws Exception {
        mockMvc.perform(post("/api/v1/auth/send-code")
                        .contentType("application/json")
                        .content("{\"email\":\"%s\",\"scene\":\"login\"}".formatted(uniqueEmail())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000));
    }

    // ---------- Group B: verification-code semantics (suspected defects) ----------

    /**
     * A user who fat-fingers the code once should still be able to finish registration by
     * submitting the correct code. Probes whether a wrong guess burns the valid stored code.
     */
    @Test
    void correctCodeStillWorksAfterOneWrongAttempt() throws Exception {
        String email = uniqueEmail();
        seedCode(email, "register", "654321");

        // First attempt: wrong code -> should fail.
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content(registerBody(email, "000000")))
                .andExpect(status().isBadRequest());

        // Second attempt: the CORRECT code -> should succeed.
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content(registerBody(email, "654321")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0));
    }

    /** After the wrong-attempt cap is exceeded, the code is invalidated even if later supplied correctly. */
    @Test
    void codeIsInvalidatedAfterTooManyWrongAttempts() throws Exception {
        String email = uniqueEmail();
        seedCode(email, "register", "654321");

        for (int attempt = 0; attempt < 5; attempt++) {
            mockMvc.perform(post("/api/v1/auth/register")
                            .contentType("application/json")
                            .content(registerBody(email, "000000")))
                    .andExpect(status().isBadRequest());
        }

        // 6th attempt uses the correct code but must be rejected: the cap has invalidated it.
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content(registerBody(email, "654321")))
                .andExpect(status().isBadRequest());
    }

    // ---------- Group C: JWT token-type confusion (security) ----------

    @Test
    void refreshTokenIsRejectedWhenUsedAsAccessBearer() throws Exception {
        String email = uniqueEmail();
        MvcResult registration = registerFresh(email);
        String refreshToken = jsonField(registration, "refreshToken");

        mockMvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + refreshToken))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40100));
    }

    @Test
    void accessTokenIsRejectedWhenUsedAsRefreshToken() throws Exception {
        String email = uniqueEmail();
        MvcResult registration = registerFresh(email);
        String accessToken = jsonField(registration, "accessToken");

        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType("application/json")
                        .content("{\"refreshToken\":\"%s\"}".formatted(accessToken)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40102));
    }

    @Test
    void tamperedAccessTokenIsRejected() throws Exception {
        String email = uniqueEmail();
        MvcResult registration = registerFresh(email);
        String accessToken = jsonField(registration, "accessToken");
        String tampered = accessToken.substring(0, accessToken.length() - 2)
                + (accessToken.endsWith("a") ? "bb" : "aa");

        mockMvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + tampered))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40100));
    }

    // ---------- Group D: Authorization header parsing ----------

    @Test
    void lowercaseBearerSchemeIsRejected() throws Exception {
        String email = uniqueEmail();
        MvcResult registration = registerFresh(email);
        String accessToken = jsonField(registration, "accessToken");

        mockMvc.perform(get("/api/v1/users/me").header("Authorization", "bearer " + accessToken))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40100));
    }

    // ---------- Group E: state / persistence coverage gap ----------

    @Test
    void updateMePersistsNicknameAndAvatar() throws Exception {
        String email = uniqueEmail();
        MvcResult registration = registerFresh(email);
        String accessToken = jsonField(registration, "accessToken");

        mockMvc.perform(put("/api/v1/users/me")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType("application/json")
                        .content("{\"nickname\":\"Renamed\",\"avatar\":\"https://cdn/a.png\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.nickname").value("Renamed"));

        mockMvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.nickname").value("Renamed"))
                .andExpect(jsonPath("$.data.avatar").value("https://cdn/a.png"));
    }

    // ---------- helpers ----------

    private MvcResult registerFresh(String email) throws Exception {
        seedCode(email, "register", "111111");
        return mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content(registerBody(email, "111111")))
                .andExpect(status().isOk())
                .andReturn();
    }

    private void seedCode(String email, String scene, String code) {
        tokenStore.put("auth:verification:code:" + scene + ':' + email, code, Duration.ofMinutes(10));
    }

    private static String uniqueEmail() {
        return "edge-" + UUID.randomUUID() + "@example.com";
    }

    private static String registerBody(String email, String code) {
        return "{\"email\":\"%s\",\"password\":\"%s\",\"nickname\":\"Learner\",\"code\":\"%s\"}"
                .formatted(email, PASSWORD, code);
    }

    private static String jsonField(MvcResult result, String field) throws Exception {
        return com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.data." + field);
    }
}
