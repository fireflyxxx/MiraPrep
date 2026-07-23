package com.miraprep.report.dto;

import jakarta.validation.constraints.NotBlank;

public record GradeFailedRequest(@NotBlank String errorCode, @NotBlank String errorMessage) {}
