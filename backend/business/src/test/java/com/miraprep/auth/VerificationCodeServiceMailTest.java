package com.miraprep.auth;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class VerificationCodeServiceMailTest {

    @Test
    void sendCodeDeliversTheStoredCodeThroughConfiguredMailer() {
        AuthTokenStore tokenStore = mock(AuthTokenStore.class);
        RequestRateLimiter rateLimiter = mock(RequestRateLimiter.class);
        VerificationCodeMailer mailer = mock(VerificationCodeMailer.class);
        when(rateLimiter.tryAcquire(any(), any(Integer.class), any(Duration.class))).thenReturn(true);

        VerificationCodeService service =
                new VerificationCodeService(
                        tokenStore, rateLimiter, 600, 60, 5, "", 20, 5, 1000, 3600, mailer);

        service.sendCode(" USER@Example.COM ", "register", "127.0.0.1");

        ArgumentCaptor<String> deliveredCode = ArgumentCaptor.forClass(String.class);
        verify(mailer)
                .send(
                        org.mockito.ArgumentMatchers.eq("user@example.com"),
                        org.mockito.ArgumentMatchers.eq("register"),
                        deliveredCode.capture());
        ArgumentCaptor<String> storedCode = ArgumentCaptor.forClass(String.class);
        verify(tokenStore)
                .put(
                        org.mockito.ArgumentMatchers.eq(
                                "auth:verification:code:register:user@example.com"),
                        storedCode.capture(),
                        org.mockito.ArgumentMatchers.eq(Duration.ofMinutes(10)));
        org.assertj.core.api.Assertions.assertThat(deliveredCode.getValue())
                .matches("\\d{6}")
                .isEqualTo(storedCode.getValue());
    }

    @Test
    void failedDeliveryRemovesTheUnusableCode() {
        AuthTokenStore tokenStore = mock(AuthTokenStore.class);
        RequestRateLimiter rateLimiter = mock(RequestRateLimiter.class);
        VerificationCodeMailer mailer = mock(VerificationCodeMailer.class);
        when(rateLimiter.tryAcquire(any(), any(Integer.class), any(Duration.class))).thenReturn(true);
        doThrow(new IllegalStateException("smtp unavailable"))
                .when(mailer)
                .send(any(), any(), any());
        VerificationCodeService service =
                new VerificationCodeService(
                        tokenStore, rateLimiter, 600, 60, 5, "", 20, 5, 1000, 3600, mailer);

        org.junit.jupiter.api.Assertions.assertThrows(
                IllegalStateException.class,
                () -> service.sendCode("user@example.com", "register", "127.0.0.1"));

        verify(tokenStore).delete("auth:verification:code:register:user@example.com");
        verify(rateLimiter, times(4)).release(any());
    }
}
