package com.miraprep.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record SendVerificationCodeRequest(
        @NotBlank @Email String email, @NotBlank @Pattern(regexp = "register|reset") String scene) {}
