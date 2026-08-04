package com.miraprep.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.auth.verification.mail-mode", havingValue = "smtp")
public class SmtpVerificationCodeMailer implements VerificationCodeMailer {
    private final JavaMailSender mailSender;
    private final String from;

    public SmtpVerificationCodeMailer(
            JavaMailSender mailSender, @Value("${app.auth.verification.mail-from}") String from) {
        this.mailSender = mailSender;
        this.from = from;
    }

    @Override
    public void send(String email, String scene, String code) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject("MiraPrep 验证码");
        message.setText(
                "你的 MiraPrep 验证码是：%s%n%n验证码 10 分钟内有效，请勿转发给他人。%n用途：%s"
                        .formatted(code, scene));
        mailSender.send(message);
    }
}
