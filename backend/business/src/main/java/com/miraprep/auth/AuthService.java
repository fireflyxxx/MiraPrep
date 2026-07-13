package com.miraprep.auth;

import com.miraprep.auth.dto.AuthResponse;
import com.miraprep.auth.dto.LoginRequest;
import com.miraprep.auth.dto.RefreshResponse;
import com.miraprep.auth.dto.RegisterRequest;
import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import com.miraprep.domain.User;
import com.miraprep.user.UserRepository;
import com.miraprep.user.dto.UserResponse;
import io.jsonwebtoken.JwtException;
import java.time.Duration;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private static final String REFRESH_KEY_PREFIX = "auth:refresh:";
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthTokenStore tokenStore;
    private final VerificationCodeService verificationCodeService;
    private final RequestRateLimiter rateLimiter;
    private final Duration loginWindow;
    private final int loginMaxAttempts;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            AuthTokenStore tokenStore,
            VerificationCodeService verificationCodeService,
            RequestRateLimiter rateLimiter,
            @Value("${app.auth.login-window}") long loginWindowSeconds,
            @Value("${app.auth.login-max-attempts}") int loginMaxAttempts) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.tokenStore = tokenStore;
        this.verificationCodeService = verificationCodeService;
        this.rateLimiter = rateLimiter;
        this.loginWindow = Duration.ofSeconds(loginWindowSeconds);
        this.loginMaxAttempts = loginMaxAttempts;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (!verificationCodeService.verifyAndConsume(email, "register", request.code())) {
            throw new BusinessException(ErrorCode.INVALID_PARAM);
        }
        if (userRepository.existsByEmail(email)) {
            throw new BusinessException(ErrorCode.INVALID_PARAM);
        }
        User user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setNickname(request.nickname());
        userRepository.save(user);
        return toAuthResponse(user);
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request, String clientIp) {
        String email = normalizeEmail(request.email());
        String rateLimitKey = "auth:login:" + clientIp + ':' + email;
        if (!rateLimiter.tryAcquire(rateLimitKey, loginMaxAttempts, loginWindow)) {
            throw new BusinessException(ErrorCode.LOGIN_RATE_LIMITED);
        }
        User user = userRepository.findByEmail(email).orElseThrow(() -> new BusinessException(ErrorCode.INVALID_CREDENTIALS));
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        return toAuthResponse(user);
    }

    public RefreshResponse refresh(String refreshToken) {
        try {
            JwtClaims claims = jwtService.parseRefreshToken(refreshToken);
            String registeredUserId = tokenStore.consume(refreshKey(claims.tokenId()));
            if (!Long.toString(claims.userId()).equals(registeredUserId)) {
                throw new BusinessException(ErrorCode.INVALID_REFRESH_TOKEN);
            }
            IssuedRefreshToken newRefresh = jwtService.createRefreshToken(claims.userId());
            tokenStore.put(refreshKey(newRefresh.tokenId()), Long.toString(claims.userId()), jwtService.refreshTtl());
            return new RefreshResponse(jwtService.createAccessToken(claims.userId()), newRefresh.value());
        } catch (JwtException exception) {
            throw new BusinessException(ErrorCode.INVALID_REFRESH_TOKEN);
        }
    }

    private AuthResponse toAuthResponse(User user) {
        IssuedRefreshToken refreshToken = jwtService.createRefreshToken(user.getId());
        tokenStore.put(refreshKey(refreshToken.tokenId()), Long.toString(user.getId()), jwtService.refreshTtl());
        return new AuthResponse(jwtService.createAccessToken(user.getId()), refreshToken.value(), UserResponse.from(user));
    }

    private static String refreshKey(String tokenId) {
        return REFRESH_KEY_PREFIX + tokenId;
    }

    private static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
