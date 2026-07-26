package com.miraprep.interview.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/** 运行时动态出题时追加一道题；order 由 Spring 按现有题数决定，避免并发下重号。 */
public record AppendQuestionRequest(
        @NotBlank String phase,
        @NotBlank String text,
        @NotEmpty List<@NotBlank String> focusPoints,
        @NotNull @Min(1) Integer suggestedSeconds) {}
