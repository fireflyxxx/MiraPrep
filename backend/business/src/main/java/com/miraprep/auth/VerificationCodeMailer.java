package com.miraprep.auth;

public interface VerificationCodeMailer {
    void send(String email, String scene, String code);
}
