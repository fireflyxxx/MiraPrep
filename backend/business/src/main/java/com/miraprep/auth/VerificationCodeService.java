package com.miraprep.auth;

import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class VerificationCodeService {
    private final AuthTokenStore tokenStore;
    private final RequestRateLimiter rateLimiter;
    private final Duration codeTtl;
    private final Duration resendTtl;
    private final int maxVerifyAttempts;
    private final int sendIpMaxAttempts;
    private final int sendRecipientMaxAttempts;
    private final int sendGlobalMaxAttempts;
    private final Duration sendWindow;
    private final String fixedCode;
    private final VerificationCodeMailer mailer;
    private final SecureRandom secureRandom = new SecureRandom();

    public VerificationCodeService(
            AuthTokenStore tokenStore,
            RequestRateLimiter rateLimiter,
            @Value("${app.auth.verification.ttl}") long codeTtlSeconds,
            @Value("${app.auth.verification.resend-ttl}") long resendTtlSeconds,
            @Value("${app.auth.verification.max-attempts:5}") int maxVerifyAttempts,
            @Value("${app.auth.verification.fixed-code:}") String fixedCode,
            @Value("${app.auth.verification.send-ip-max-attempts:20}") int sendIpMaxAttempts,
            @Value("${app.auth.verification.send-recipient-max-attempts:5}")
                    int sendRecipientMaxAttempts,
            @Value("${app.auth.verification.send-global-max-attempts:1000}")
                    int sendGlobalMaxAttempts,
            @Value("${app.auth.verification.send-window:3600}") long sendWindowSeconds,
            VerificationCodeMailer mailer) {
        this.tokenStore = tokenStore;
        this.rateLimiter = rateLimiter;
        this.codeTtl = Duration.ofSeconds(codeTtlSeconds);
        this.resendTtl = Duration.ofSeconds(resendTtlSeconds);
        this.maxVerifyAttempts = maxVerifyAttempts;
        this.fixedCode = fixedCode;
        this.sendIpMaxAttempts = sendIpMaxAttempts;
        this.sendRecipientMaxAttempts = sendRecipientMaxAttempts;
        this.sendGlobalMaxAttempts = sendGlobalMaxAttempts;
        this.sendWindow = Duration.ofSeconds(sendWindowSeconds);
        this.mailer = mailer;
    }

    public void sendCode(String email, String scene, String clientIp) {
        String normalizedEmail = normalizeEmail(email);
        String requestKey = "auth:verification:resend:" + clientIp + ':' + scene + ':' + normalizedEmail;
        List<String> acquiredKeys = new ArrayList<>();
        acquireOrThrow(acquiredKeys, "auth:verification:send:global", sendGlobalMaxAttempts, sendWindow);
        acquireOrThrow(
                acquiredKeys,
                "auth:verification:send:ip:" + clientIp,
                sendIpMaxAttempts,
                sendWindow);
        acquireOrThrow(
                acquiredKeys,
                "auth:verification:send:recipient:" + scene + ':' + normalizedEmail,
                sendRecipientMaxAttempts,
                sendWindow);
        acquireOrThrow(acquiredKeys, requestKey, 1, resendTtl);
        String code = String.format("%06d", secureRandom.nextInt(1_000_000));
        String codeKey = codeKey(normalizedEmail, scene);
        tokenStore.put(codeKey, code, codeTtl);
        try {
            mailer.send(normalizedEmail, scene, code);
        } catch (RuntimeException exception) {
            tokenStore.delete(codeKey);
            acquiredKeys.forEach(rateLimiter::release);
            throw exception;
        }
    }

    private void acquireOrThrow(
            List<String> acquiredKeys, String key, int limit, Duration window) {
        if (!rateLimiter.tryAcquire(key, limit, window)) {
            acquiredKeys.forEach(rateLimiter::release);
            throw new BusinessException(ErrorCode.RATE_LIMITED);
        }
        acquiredKeys.add(key);
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
