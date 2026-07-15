package com.miraprep.interview.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record OutlineQuestionRequest(
        @NotBlank String phase,
        @NotBlank String text,
        List<@NotBlank String> focusPoints,
        @NotNull @Min(1) Integer order,
        @NotNull @Min(1) Integer suggestedSeconds) {}
