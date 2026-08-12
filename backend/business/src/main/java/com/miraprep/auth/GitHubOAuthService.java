package com.miraprep.auth;

import com.miraprep.auth.dto.AuthResponse;
import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import com.miraprep.domain.User;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * GitHub 登录（T-120）。
 *
 * <p>和 Google 那条路不同：GitHub 不签 ID Token，只能走标准授权码流程——前端把用户送去
 * GitHub 授权，GitHub 带着 code 跳回前端回调页，回调页把 code 交给这里，由后端用
 * client_secret 换 access token，再去查用户与邮箱。secret 只存在于后端。
 *
 * <p>防 CSRF 的 state 由前端生成并自行比对（存 sessionStorage），攻击者无法写入受害者的
 * sessionStorage，所以后端不需要也保存一份。
 */
@Service
public class GitHubOAuthService {

    private static final ParameterizedTypeReference<Map<String, Object>> JSON_OBJECT =
            new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<List<Map<String, Object>>> JSON_ARRAY =
            new ParameterizedTypeReference<>() {};

    private final RestClient oauthClient;
    private final RestClient apiClient;
    private final AuthService authService;
    private final RequestRateLimiter rateLimiter;
    private final String clientId;
    private final String clientSecret;
    private final Duration loginWindow;
    private final int loginMaxAttempts;

    public GitHubOAuthService(
            AuthService authService,
            RequestRateLimiter rateLimiter,
            @Value("${app.auth.oauth.github.client-id:}") String clientId,
            @Value("${app.auth.oauth.github.client-secret:}") String clientSecret,
            @Value("${app.auth.oauth.github.oauth-base-url}") String oauthBaseUrl,
            @Value("${app.auth.oauth.github.api-base-url}") String apiBaseUrl,
            @Value("${app.auth.login-window}") long loginWindowSeconds,
            @Value("${app.auth.login-max-attempts}") int loginMaxAttempts) {
        this.oauthClient = RestClient.builder().baseUrl(oauthBaseUrl).build();
        // GitHub API 强制要求带 User-Agent，缺了直接 403。
        this.apiClient = RestClient.builder()
                .baseUrl(apiBaseUrl)
                .defaultHeader("User-Agent", "MiraPrep")
                .defaultHeader("Accept", "application/vnd.github+json")
                .defaultHeader("X-GitHub-Api-Version", "2022-11-28")
                .build();
        this.authService = authService;
        this.rateLimiter = rateLimiter;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.loginWindow = Duration.ofSeconds(loginWindowSeconds);
        this.loginMaxAttempts = loginMaxAttempts;
    }

    // ponytail: 三次外部调用（换 token、查用户、查邮箱）都在事务里，登录期间多占约 300ms 连接；
    // 登录量上来后把这三步挪到事务外，只把 linkOrCreateOAuthUser 留在事务内。
    @Transactional
    public AuthResponse login(String code, String clientIp) {
        // 没配 client id/secret 就等于没开这条登录路径。
        if (clientId.isBlank() || clientSecret.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        if (!rateLimiter.tryAcquire("auth:oauth:github:" + clientIp, loginMaxAttempts, loginWindow)) {
            throw new BusinessException(ErrorCode.RATE_LIMITED);
        }

        String accessToken = exchangeCode(code);
        Map<String, Object> profile = get("/user", accessToken, JSON_OBJECT);
        String email = primaryVerifiedEmail(accessToken);

        String name = string(profile, "name");
        User user = authService.linkOrCreateOAuthUser(
                email, name.isBlank() ? string(profile, "login") : name, string(profile, "avatar_url"));
        return authService.issueTokens(user);
    }

    /**
     * 用 code 换 access token。注意 GitHub 换 token 失败时**仍然返回 200**，错误藏在
     * 响应体的 error 字段里——只看 HTTP 状态码会把失败当成功。
     */
    private String exchangeCode(String code) {
        Map<String, Object> response;
        try {
            response = oauthClient
                    .post()
                    .uri("/login/oauth/access_token")
                    .accept(MediaType.APPLICATION_JSON)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("client_id", clientId, "client_secret", clientSecret, "code", code))
                    .retrieve()
                    .body(JSON_OBJECT);
        } catch (RestClientException exception) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        if (response == null || !string(response, "error").isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        String accessToken = string(response, "access_token");
        if (accessToken.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        return accessToken;
    }

    /**
     * 信任边界：只接受 primary 且 verified 的邮箱。GitHub 允许挂未验证的邮箱，若拿它去
     * 按 email 关联账号，注册一个 `受害者@example.com` 就能顶掉别人的账号。
     */
    private String primaryVerifiedEmail(String accessToken) {
        List<Map<String, Object>> emails = get("/user/emails", accessToken, JSON_ARRAY);
        if (emails == null) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        return emails.stream()
                .filter(entry -> Boolean.TRUE.equals(entry.get("primary"))
                        && Boolean.TRUE.equals(entry.get("verified")))
                .map(entry -> string(entry, "email"))
                .filter(email -> !email.isBlank())
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_CREDENTIALS));
    }

    private <T> T get(String path, String accessToken, ParameterizedTypeReference<T> type) {
        try {
            return apiClient.get().uri(path).header("Authorization", "Bearer " + accessToken).retrieve().body(type);
        } catch (RestClientException exception) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
    }

    private static String string(Map<String, Object> source, String key) {
        Object value = source.get(key);
        return value == null ? "" : value.toString();
    }
}
