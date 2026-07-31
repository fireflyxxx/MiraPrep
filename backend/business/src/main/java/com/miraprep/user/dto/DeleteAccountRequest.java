package com.miraprep.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record DeleteAccountRequest(
        @NotBlank @Size(min = 8, max = 128) String password,
        @NotBlank @Pattern(regexp = "DELETE") String confirmation) {}
