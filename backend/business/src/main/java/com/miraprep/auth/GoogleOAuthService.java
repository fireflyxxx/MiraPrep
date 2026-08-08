package com.miraprep.auth;

import com.miraprep.auth.dto.AuthResponse;
import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import com.miraprep.domain.User;
import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Google 登录（T-120）。
 *
 * <p>走的是 Google Identity Services 的 ID Token 流程，不是授权码流程：前端按钮直接拿到一个
 * Google 签名的 ID Token，后端只负责验签 + 按邮箱关联/建号 + 签发自己的 JWT。因此不需要
 * authorize/callback 两个跳转端点、不需要 state/PKCE、也不需要 client_secret。
 */
@Service
public class GoogleOAuthService {

    private static final ParameterizedTypeReference<Map<String, Object>> TOKEN_INFO =
            new ParameterizedTypeReference<>() {};

    private final RestClient restClient;
    private final AuthService authService;
    private final RequestRateLimiter rateLimiter;
    private final String clientId;
    private final Duration loginWindow;
    private final int loginMaxAttempts;

    public GoogleOAuthService(
            AuthService authService,
            RequestRateLimiter rateLimiter,
            @Value("${app.auth.oauth.google.client-id:}") String clientId,
            @Value("${app.auth.oauth.google.tokeninfo-base-url}") String tokenInfoBaseUrl,
            @Value("${app.auth.login-window}") long loginWindowSeconds,
            @Value("${app.auth.login-max-attempts}") int loginMaxAttempts) {
        this.restClient = RestClient.builder().baseUrl(tokenInfoBaseUrl).build();
        this.authService = authService;
        this.rateLimiter = rateLimiter;
        this.clientId = clientId;
        this.loginWindow = Duration.ofSeconds(loginWindowSeconds);
        this.loginMaxAttempts = loginMaxAttempts;
    }

    // ponytail: tokeninfo 调用留在事务里，登录期间多占约 100ms 连接；
    // 登录量上来后把验签挪到事务外，或换 google-api-client 的本地 JWKS 验签。
    @Transactional
    public AuthResponse login(String idToken, String clientIp) {
        // 没配 client id 就等于没开这条登录路径。绝不能放行——否则 aud 校验形同虚设。
        if (clientId.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        if (!rateLimiter.tryAcquire("auth:oauth:google:" + clientIp, loginMaxAttempts, loginWindow)) {
            throw new BusinessException(ErrorCode.RATE_LIMITED);
        }

        Map<String, Object> claims = verify(idToken);
        User user = authService.linkOrCreateOAuthUser(
                stringClaim(claims, "email"), stringClaim(claims, "name"), stringClaim(claims, "picture"));
        return authService.issueTokens(user);
    }

    /**
     * 信任边界：aud / iss / email_verified 三项缺一不可。少校验 aud，任何人都能拿别的 Google
     * 应用签发的 token 登录本站；少校验 email_verified，能拿未验证邮箱冒充他人账号。
     * 过期与签名由 tokeninfo 端点负责，token 无效时它直接返回 4xx。
     */
    private Map<String, Object> verify(String idToken) {
        Map<String, Object> claims;
        try {
            claims = restClient
                    .get()
                    .uri(uri -> uri.path("/tokeninfo").queryParam("id_token", idToken).build())
                    .retrieve()
                    .body(TOKEN_INFO);
        } catch (RestClientException exception) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        if (claims == null
                || !clientId.equals(stringClaim(claims, "aud"))
                || !isGoogleIssuer(stringClaim(claims, "iss"))
                || !"true".equals(stringClaim(claims, "email_verified"))
                || stringClaim(claims, "email").isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        return claims;
    }

    private static boolean isGoogleIssuer(String issuer) {
        return "accounts.google.com".equals(issuer) || "https://accounts.google.com".equals(issuer);
    }

    private static String stringClaim(Map<String, Object> claims, String key) {
        Object value = claims.get(key);
        return value == null ? "" : value.toString();
    }
}
