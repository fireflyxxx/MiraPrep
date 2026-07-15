package com.miraprep.interview.dto;

import jakarta.validation.constraints.NotBlank;

public record EndInterviewRequest(@NotBlank String reason) {}
