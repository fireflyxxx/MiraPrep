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
 * T-120 GitHub 登录。用一个本地桩服务同时扮演 github.com 与 api.github.com，覆盖建号、
 * 关联已有邮箱、以及三条必须拒绝的路径（换 token 失败、邮箱未验证、非 primary 邮箱）。
 */
@SpringBootTest(classes = BusinessApplication.class)
@AutoConfigureMockMvc
class GitHubOAuthApiIntegrationTest {

    /** code → 该 code 换到的 access token；access token → 该用户的 /user 与 /user/emails 响应。 */
    private static final Map<String, String> CODES = new ConcurrentHashMap<>();
    private static final Map<String, String> PROFILES = new ConcurrentHashMap<>();
    private static final Map<String, String> EMAILS = new ConcurrentHashMap<>();
    private static final HttpServer GITHUB_STUB = startGitHubStub();

    @Autowired private MockMvc mockMvc;

    @Autowired private JdbcTemplate jdbcTemplate;

    private static HttpServer startGitHubStub() {
        HttpServer server;
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException exception) {
            throw new IllegalStateException("cannot start github stub", exception);
        }
        server.createContext("/login/oauth/access_token", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            String token = CODES.entrySet().stream()
                    .filter(entry -> body.contains("\"code\":\"" + entry.getKey() + "\""))
                    .map(Map.Entry::getValue)
                    .findFirst()
                    .orElse(null);
            // GitHub 换 token 失败时也返回 200，错误放在响应体里——桩要照抄这个行为。
            respond(exchange, 200, token == null
                    ? "{\"error\":\"bad_verification_code\"}"
                    : "{\"access_token\":\"%s\",\"token_type\":\"bearer\"}".formatted(token));
        });
        server.createContext("/user", exchange -> {
            String token = String.valueOf(exchange.getRequestHeaders().getFirst("Authorization"))
                    .replaceFirst("^Bearer ", "");
            boolean emailsPath = exchange.getRequestURI().getPath().endsWith("/emails");
            String body = (emailsPath ? EMAILS : PROFILES).get(token);
            respond(exchange, body == null ? 401 : 200, body == null ? "{\"message\":\"Bad credentials\"}" : body);
        });
        server.start();
        Runtime.getRuntime().addShutdownHook(new Thread(() -> server.stop(0)));
        return server;
    }

    private static void respond(com.sun.net.httpserver.HttpExchange exchange, int status, String body)
            throws IOException {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, payload.length);
        exchange.getResponseBody().write(payload);
        exchange.close();
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:h2:mem:githuboauth;MODE=MySQL;DB_CLOSE_DELAY=-1");
        registry.add("spring.datasource.driver-class-name", () -> "org.h2.Driver");
        registry.add("spring.datasource.username", () -> "sa");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.data.redis.repositories.enabled", () -> false);
        registry.add("app.auth.jwt-secret", () -> "test-jwt-secret-that-is-long-enough-for-hmac-sha256");
        registry.add("app.auth.verification.fixed-code", () -> "123456");
        registry.add("app.auth.token-store", () -> "memory");
        registry.add("app.auth.rate-limiter", () -> "memory");
        registry.add("app.auth.login-max-attempts", () -> "50");
        registry.add("app.auth.oauth.github.client-id", () -> "test-github-client-id");
        registry.add("app.auth.oauth.github.client-secret", () -> "test-github-client-secret");
        String base = "http://127.0.0.1:" + GITHUB_STUB.getAddress().getPort();
        registry.add("app.auth.oauth.github.oauth-base-url", () -> base);
        registry.add("app.auth.oauth.github.api-base-url", () -> base);
    }

    @Test
    void firstGitHubLoginCreatesTheAccountAndKeepsItOnTheOnboardingPath() throws Exception {
        String email = uniqueEmail();
        String code = stub(email, "Mira Learner", true, true);

        mockMvc.perform(gitHubLogin(code))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.email").value(email))
                .andExpect(jsonPath("$.data.user.nickname").value("Mira Learner"))
                .andExpect(jsonPath("$.data.user.isFirstLogin").value(true))
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty());

        String passwordHash = jdbcTemplate.queryForObject(
                "SELECT password_hash FROM users WHERE email = ?", String.class, email);
        assertThat(passwordHash).startsWith("$2");
    }

    @Test
    void gitHubLoginLinksAnExistingEmailAccountInsteadOfCreatingASecondOne() throws Exception {
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

        mockMvc.perform(gitHubLogin(stub(email, "GitHub Name", true, true)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.id").value(existingId))
                .andExpect(jsonPath("$.data.user.nickname").value("Existing"));

        assertThat(userCount(email)).isEqualTo(1);
    }

    @Test
    void unverifiedOrNonPrimaryGitHubEmailsAreRejected() throws Exception {
        String unverified = uniqueEmail();
        mockMvc.perform(gitHubLogin(stub(unverified, "Unverified", true, false)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40101));

        String secondary = uniqueEmail();
        mockMvc.perform(gitHubLogin(stub(secondary, "Secondary", false, true)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40101));

        assertThat(userCount(unverified)).isZero();
        assertThat(userCount(secondary)).isZero();
    }

    @Test
    void aCodeGitHubRefusesToExchangeIsRejectedEvenThoughGitHubAnswers200() throws Exception {
        mockMvc.perform(gitHubLogin("never-issued-by-github"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40101));
    }

    private Integer userCount(String email) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users WHERE email = ?", Integer.class, email);
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder gitHubLogin(
            String code) {
        return post("/api/v1/auth/oauth/github")
                .contentType("application/json")
                .content("{\"code\":\"%s\"}".formatted(code));
    }

    /** 登记一个可换取的 code 及其背后的 GitHub 用户，返回 code。 */
    private static String stub(String email, String name, boolean primary, boolean verified) {
        String code = "code-" + UUID.randomUUID();
        String token = "token-" + UUID.randomUUID();
        CODES.put(code, token);
        PROFILES.put(
                token,
                "{\"login\":\"mira\",\"name\":\"%s\",\"avatar_url\":\"https://avatars.githubusercontent.com/u/1\"}"
                        .formatted(name));
        EMAILS.put(
                token,
                "[{\"email\":\"%s\",\"primary\":%s,\"verified\":%s}]".formatted(email, primary, verified));
        return code;
    }

    private static String uniqueEmail() {
        return "github-" + UUID.randomUUID() + "@example.com";
    }
}
