package com.miraprep;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(classes = BusinessApplication.class)
@AutoConfigureMockMvc
class AuthApiIntegrationTest {

    private static final String PASSWORD = "safe-password-123";

    @Autowired private MockMvc mockMvc;

    @Autowired private JdbcTemplate jdbcTemplate;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:h2:mem:auth;MODE=MySQL;DB_CLOSE_DELAY=-1");
        registry.add("spring.datasource.driver-class-name", () -> "org.h2.Driver");
        registry.add("spring.datasource.username", () -> "sa");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.data.redis.repositories.enabled", () -> false);
        registry.add("app.auth.jwt-secret", () -> "test-jwt-secret-that-is-long-enough-for-hmac-sha256");
        registry.add("app.auth.verification.fixed-code", () -> "123456");
        registry.add("app.auth.token-store", () -> "memory");
        registry.add("app.auth.rate-limiter", () -> "memory");
        registry.add("app.auth.login-max-attempts", () -> "3");
    }

    @Test
    void registrationLoginAndProfileLifecycleUseJwtAndBcrypt() throws Exception {
        String email = uniqueEmail();

        MvcResult registration = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content(registerBody(email)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.user.email").value(email))
                .andExpect(jsonPath("$.data.user.isFirstLogin").value(true))
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
                .andReturn();

        String storedPassword = jdbcTemplate.queryForObject(
                "SELECT password_hash FROM users WHERE email = ?", String.class, email);
        org.assertj.core.api.Assertions.assertThat(storedPassword).startsWith("$2").isNotEqualTo(PASSWORD);

        String registrationToken = jsonField(registration, "accessToken");
        mockMvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + registrationToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.email").value(email));

        mockMvc.perform(put("/api/v1/users/me/profile")
                        .header("Authorization", "Bearer " + registrationToken)
                        .contentType("application/json")
                        .content("""
                                {"jobDirection":"backend","techStacks":["Java","Spring"],
                                 "experienceLevel":"JUNIOR","status":"ACTIVE",
                                 "targetCompany":"Mira Labs","preferences":{"duration":30}}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.jobDirection").value("backend"))
                .andExpect(jsonPath("$.data.techStacks[1]").value("Spring"));

        mockMvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + registrationToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isFirstLogin").value(false));

        MvcResult login = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType("application/json")
                        .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.isFirstLogin").value(false))
                .andReturn();

        String loginToken = jsonField(login, "accessToken");
        mockMvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + loginToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.nickname").value("Learner"));
    }

    @Test
    void skippingOnboardingPersistsAnEmptyProfileAndClearsFirstLogin() throws Exception {
        String email = uniqueEmail();
        MvcResult registration = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content(registerBody(email)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.isFirstLogin").value(true))
                .andReturn();
        String accessToken = jsonField(registration, "accessToken");

        mockMvc.perform(put("/api/v1/users/me/profile")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType("application/json")
                        .content("""
                                {"jobDirection":null,"techStacks":[],"experienceLevel":null,
                                 "status":null,"targetCompany":null,"preferences":{}}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.jobDirection", nullValue()))
                .andExpect(jsonPath("$.data.techStacks").isEmpty())
                .andExpect(jsonPath("$.data.experienceLevel", nullValue()))
                .andExpect(jsonPath("$.data.status", nullValue()))
                .andExpect(jsonPath("$.data.targetCompany", nullValue()));

        Long userId = jdbcTemplate.queryForObject("SELECT id FROM users WHERE email = ?", Long.class, email);
        Integer profileCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM user_profile WHERE user_id = ?", Integer.class, userId);
        Boolean isFirstLogin = jdbcTemplate.queryForObject(
                "SELECT is_first_login FROM users WHERE id = ?", Boolean.class, userId);
        org.assertj.core.api.Assertions.assertThat(profileCount).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(isFirstLogin).isFalse();

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType("application/json")
                        .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.isFirstLogin").value(false));
    }

    @Test
    void refreshRotationRejectsThePreviousRefreshToken() throws Exception {
        String email = uniqueEmail();
        MvcResult registration = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content(registerBody(email)))
                .andExpect(status().isOk())
                .andReturn();
        String oldRefreshToken = jsonField(registration, "refreshToken");

        MvcResult refresh = mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType("application/json")
                        .content("{\"refreshToken\":\"%s\"}".formatted(oldRefreshToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.data.refreshToken").isNotEmpty())
                .andReturn();

        String newRefreshToken = jsonField(refresh, "refreshToken");
        org.assertj.core.api.Assertions.assertThat(newRefreshToken).isNotEqualTo(oldRefreshToken);

        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType("application/json")
                        .content("{\"refreshToken\":\"%s\"}".formatted(oldRefreshToken)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40102));
    }

    @Test
    void authenticationErrorsAndRateLimitsReturnTheirContractedCodes() throws Exception {
        String email = uniqueEmail();

        mockMvc.perform(get("/api/v1/users/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40100));
        mockMvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer malformed"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40100));

        mockMvc.perform(post("/api/v1/auth/send-code")
                        .contentType("application/json")
                        .content("{\"email\":\"%s\",\"scene\":\"register\"}".formatted(email)))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/auth/send-code")
                        .contentType("application/json")
                        .content("{\"email\":\"%s\",\"scene\":\"register\"}".formatted(email)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value(42901));

        for (int attempt = 0; attempt < 3; attempt++) {
            mockMvc.perform(post("/api/v1/auth/login")
                            .contentType("application/json")
                            .content("{\"email\":\"%s\",\"password\":\"wrong-password\"}".formatted(email)))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value(40101));
        }
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType("application/json")
                        .content("{\"email\":\"%s\",\"password\":\"wrong-password\"}".formatted(email)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value(42900));
    }

    private static String uniqueEmail() {
        return "learner-" + UUID.randomUUID() + "@example.com";
    }

    private static String registerBody(String email) {
        return "{\"email\":\"%s\",\"password\":\"%s\",\"nickname\":\"Learner\",\"code\":\"123456\"}"
                .formatted(email, PASSWORD);
    }

    private static String jsonField(MvcResult result, String field) throws Exception {
        return com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.data." + field);
    }
}
