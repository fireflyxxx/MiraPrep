package com.miraprep.interview.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RuntimeGradingRequest(
        @NotBlank String reason, @NotBlank @Size(max = 128) String requestId) {}
