package com.miraprep.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
        name = "app.auth.verification.mail-mode",
        havingValue = "console",
        matchIfMissing = true)
public class ConsoleVerificationCodeMailer implements VerificationCodeMailer {
    private static final Logger LOGGER = LoggerFactory.getLogger(ConsoleVerificationCodeMailer.class);

    @Override
    public void send(String email, String scene, String code) {
        LOGGER.info("Local verification code issued for email={} scene={}: {}", email, scene, code);
    }
}
