package com.miraprep.report.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;
import java.util.List;

public record GradeResultRequest(
        @NotBlank @Pattern(regexp = "S|A|B|C|D") String grade,
        @NotNull @Min(0) @Max(100) Integer totalScore,
        @NotNull @Valid DimensionScores dimensionScores,
        @NotBlank String summary,
        @NotEmpty List<@NotBlank String> highlights,
        @NotEmpty List<@NotBlank String> weaknesses,
        boolean partial,
        @NotEmpty List<@Valid QuestionReviewResult> questionReviews) {

    public record DimensionScores(
            @NotNull @Min(0) @Max(100) Integer professionalKnowledge,
            @NotNull @Min(0) @Max(100) Integer projectDepth,
            @NotNull @Min(0) @Max(100) Integer communicationLogic,
            @NotNull @Min(0) @Max(100) Integer adaptability,
            @NotNull @Min(0) @Max(100) Integer jobFit) {}

    public record QuestionReviewResult(
            @NotNull @Positive Long questionId,
            @NotNull @DecimalMin("0") @DecimalMax("10") BigDecimal score,
            @NotBlank String referenceAnswer,
            @NotEmpty List<@NotBlank String> suggestions,
            @NotNull List<Object> followUpChain) {}
}
