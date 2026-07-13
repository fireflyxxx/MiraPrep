package com.miraprep.auth;

import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import java.security.SecureRandom;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class VerificationCodeService {
    private static final Logger LOGGER = LoggerFactory.getLogger(VerificationCodeService.class);
    private final AuthTokenStore tokenStore;
    private final RequestRateLimiter rateLimiter;
    private final Duration codeTtl;
    private final Duration resendTtl;
    private final int maxVerifyAttempts;
    private final String fixedCode;
    private final SecureRandom secureRandom = new SecureRandom();

    public VerificationCodeService(
            AuthTokenStore tokenStore,
            RequestRateLimiter rateLimiter,
            @Value("${app.auth.verification.ttl}") long codeTtlSeconds,
            @Value("${app.auth.verification.resend-ttl}") long resendTtlSeconds,
            @Value("${app.auth.verification.max-attempts:5}") int maxVerifyAttempts,
            @Value("${app.auth.verification.fixed-code:}") String fixedCode) {
        this.tokenStore = tokenStore;
        this.rateLimiter = rateLimiter;
        this.codeTtl = Duration.ofSeconds(codeTtlSeconds);
        this.resendTtl = Duration.ofSeconds(resendTtlSeconds);
        this.maxVerifyAttempts = maxVerifyAttempts;
        this.fixedCode = fixedCode;
    }

    public void sendCode(String email, String scene, String clientIp) {
        String normalizedEmail = normalizeEmail(email);
        String requestKey = "auth:verification:resend:" + clientIp + ':' + scene + ':' + normalizedEmail;
        if (!rateLimiter.tryAcquire(requestKey, 1, resendTtl)) {
            throw new BusinessException(ErrorCode.VERIFICATION_CODE_TOO_FREQUENT);
        }
        String code = String.format("%06d", secureRandom.nextInt(1_000_000));
        tokenStore.put(codeKey(normalizedEmail, scene), code, codeTtl);
        // 邮件服务在 T-010 允许先 mock；生产替换为真正的邮件 provider 时不要把 code 打到日志。
        LOGGER.info("Mock verification code issued for email={} scene={}: {}", normalizedEmail, scene, code);
    }

    public boolean verifyAndConsume(String email, String scene, String suppliedCode) {
        if (!fixedCode.isBlank() && fixedCode.equals(suppliedCode)) {
            return true;
        }
        String normalizedEmail = normalizeEmail(email);
        String codeKey = codeKey(normalizedEmail, scene);
        // Bound brute-force of the 6-digit code: after too many attempts, invalidate it outright.
        String attemptsKey = "auth:verification:attempts:" + scene + ':' + normalizedEmail;
        if (!rateLimiter.tryAcquire(attemptsKey, maxVerifyAttempts, codeTtl)) {
            tokenStore.delete(codeKey);
            return false;
        }
        // Peek, and only consume (delete) on a correct match, so a typo does not burn a valid code.
        String expectedCode = tokenStore.get(codeKey);
        if (expectedCode != null && expectedCode.equals(suppliedCode)) {
            tokenStore.delete(codeKey);
            return true;
        }
        return false;
    }

    private static String codeKey(String email, String scene) {
        return "auth:verification:code:" + scene + ':' + email;
    }

    private static String normalizeEmail(String email) {
        return email.trim().toLowerCase();
    }
}
