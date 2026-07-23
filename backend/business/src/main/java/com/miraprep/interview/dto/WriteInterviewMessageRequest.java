package com.miraprep.interview.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record WriteInterviewMessageRequest(
        @NotBlank String role,
        @NotBlank String content,
        @NotBlank String phase,
        @Positive Long questionId,
        @Size(max = 2048) String audioUrl,
        @Min(1) int seq) {}
