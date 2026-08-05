package com.miraprep.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

class SmtpVerificationCodeMailerTest {

    @Test
    void sendsARegistrationCodeUsingTheConfiguredFromAddress() {
        JavaMailSender sender = mock(JavaMailSender.class);
        SmtpVerificationCodeMailer mailer =
                new SmtpVerificationCodeMailer(sender, "MiraPrep <no-reply@example.com>");

        mailer.send("learner@example.com", "register", "123456");

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(message.capture());
        assertThat(message.getValue().getTo()).containsExactly("learner@example.com");
        assertThat(message.getValue().getFrom()).isEqualTo("MiraPrep <no-reply@example.com>");
        assertThat(message.getValue().getSubject()).contains("验证码");
        assertThat(message.getValue().getText()).contains("123456").contains("10 分钟");
    }
}
