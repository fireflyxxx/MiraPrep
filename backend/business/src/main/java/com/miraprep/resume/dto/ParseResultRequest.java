package com.miraprep.resume.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.Map;

public record ParseResultRequest(
        @NotBlank String status, Map<String, Object> parsedJson, Integer pageCount, String error) {}
