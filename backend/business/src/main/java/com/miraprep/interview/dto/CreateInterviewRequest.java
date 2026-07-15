package com.miraprep.interview.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record CreateInterviewRequest(
        @NotNull Long resumeId,
        @NotBlank @Size(max = 255) String jobDirection,
        @Size(max = 255) String jobTitle,
        String jdText,
        @NotBlank String difficulty,
        @NotEmpty List<@NotBlank @Size(max = 64) String> types,
        @NotNull Integer durationMin,
        String customRequirements,
        @NotBlank String interviewerStyle,
        @NotNull Boolean voiceEnabled) {

    @JsonIgnore
    @AssertTrue(message = "durationMin must be one of 15, 30, 45")
    public boolean isDurationMinSupported() {
        return durationMin == null || durationMin == 15 || durationMin == 30 || durationMin == 45;
    }
}
