package com.miraprep;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * T-120 Google 登录。用本地桩服务顶掉 Google 的 tokeninfo 端点，覆盖建号、关联、以及
 * 两条必须拒绝的路径（aud 不是本站、邮箱未验证）。
 */
@SpringBootTest(classes = BusinessApplication.class)
@AutoConfigureMockMvc
class GoogleOAuthApiIntegrationTest {

    private static final String CLIENT_ID = "miraprep-test.apps.googleusercontent.com";
    private static final Map<String, String> TOKEN_INFO = new ConcurrentHashMap<>();
    private static final HttpServer GOOGLE_STUB = startGoogleStub();

    @Autowired private MockMvc mockMvc;

    @Autowired private JdbcTemplate jdbcTemplate;

    private static HttpServer startGoogleStub() {
        HttpServer server;
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException exception) {
            throw new IllegalStateException("cannot start google stub", exception);
        }
        server.createContext("/tokeninfo", exchange -> {
            String idToken = exchange.getRequestURI().getQuery().replaceFirst("^id_token=", "");
            String body = TOKEN_INFO.get(idToken);
            byte[] payload = (body == null ? "{\"error\":\"invalid_token\"}" : body)
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(body == null ? 400 : 200, payload.length);
            exchange.getResponseBody().write(payload);
            exchange.close();
        });
        server.start();
        Runtime.getRuntime().addShutdownHook(new Thread(() -> server.stop(0)));
        return server;
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:h2:mem:googleoauth;MODE=MySQL;DB_CLOSE_DELAY=-1");
        registry.add("spring.datasource.driver-class-name", () -> "org.h2.Driver");
        registry.add("spring.datasource.username", () -> "sa");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.data.redis.repositories.enabled", () -> false);
        registry.add("app.auth.jwt-secret", () -> "test-jwt-secret-that-is-long-enough-for-hmac-sha256");
        registry.add("app.auth.verification.fixed-code", () -> "123456");
        registry.add("app.auth.token-store", () -> "memory");
        registry.add("app.auth.rate-limiter", () -> "memory");
        // 这个类里所有用例共用一个 IP，限流不是被测对象（见 AuthApiIntegrationTest），放宽即可。
        registry.add("app.auth.login-max-attempts", () -> "50");
        registry.add("app.auth.oauth.google.client-id", () -> CLIENT_ID);
        registry.add(
                "app.auth.oauth.google.tokeninfo-base-url",
                () -> "http://127.0.0.1:" + GOOGLE_STUB.getAddress().getPort());
    }

    @Test
    void firstGoogleLoginCreatesTheAccountAndKeepsItOnTheOnboardingPath() throws Exception {
        String email = uniqueEmail();
        String idToken = stubToken(CLIENT_ID, email, "true", "Mira Learner");

        mockMvc.perform(googleLogin(idToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.email").value(email))
                .andExpect(jsonPath("$.data.user.nickname").value("Mira Learner"))
                .andExpect(jsonPath("$.data.user.isFirstLogin").value(true))
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.data.refreshToken").isNotEmpty());

        String passwordHash = jdbcTemplate.queryForObject(
                "SELECT password_hash FROM users WHERE email = ?", String.class, email);
        assertThat(passwordHash).startsWith("$2");
    }

    @Test
    void googleLoginLinksAnExistingEmailAccountInsteadOfCreatingASecondOne() throws Exception {
        String email = uniqueEmail();
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("""
                                {"email":"%s","password":"safe-password-123",
                                 "nickname":"Existing","code":"123456"}
                                """.formatted(email)))
                .andExpect(status().isOk());
        Long existingId = jdbcTemplate.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, email);

        mockMvc.perform(googleLogin(stubToken(CLIENT_ID, email, "true", "Google Name")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.id").value(existingId))
                .andExpect(jsonPath("$.data.user.nickname").value("Existing"));

        Integer accounts = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM users WHERE email = ?", Integer.class, email);
        assertThat(accounts).isEqualTo(1);
    }

    @Test
    void tokensIssuedForAnotherApplicationAreRejected() throws Exception {
        String email = uniqueEmail();
        String idToken = stubToken("someone-else.apps.googleusercontent.com", email, "true", "Attacker");

        mockMvc.perform(googleLogin(idToken))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40101));

        assertThat(userCount(email)).isZero();
    }

    @Test
    void unverifiedGoogleEmailsAndUnknownTokensAreRejected() throws Exception {
        String email = uniqueEmail();

        mockMvc.perform(googleLogin(stubToken(CLIENT_ID, email, "false", "Unverified")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40101));
        mockMvc.perform(googleLogin("never-issued-by-google"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40101));

        assertThat(userCount(email)).isZero();
    }

    private Integer userCount(String email) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users WHERE email = ?", Integer.class, email);
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder googleLogin(
            String idToken) {
        return post("/api/v1/auth/oauth/google")
                .contentType("application/json")
                .content("{\"idToken\":\"%s\"}".formatted(idToken));
    }

    /** 登记一个桩 token，返回它的值。 */
    private static String stubToken(String audience, String email, String emailVerified, String name) {
        String idToken = "stub-" + UUID.randomUUID();
        TOKEN_INFO.put(
                idToken,
                """
                {"iss":"https://accounts.google.com","aud":"%s","sub":"1234567890",
                 "email":"%s","email_verified":"%s","name":"%s",
                 "picture":"https://lh3.googleusercontent.com/avatar"}
                """.formatted(audience, email, emailVerified, name));
        return idToken;
    }

    private static String uniqueEmail() {
        return "google-" + UUID.randomUUID() + "@example.com";
    }
}
