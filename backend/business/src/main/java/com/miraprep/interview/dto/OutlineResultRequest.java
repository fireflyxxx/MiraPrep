package com.miraprep.interview.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record OutlineResultRequest(
        @NotBlank String status, List<@NotNull @Valid OutlineQuestionRequest> questions, String error) {}
