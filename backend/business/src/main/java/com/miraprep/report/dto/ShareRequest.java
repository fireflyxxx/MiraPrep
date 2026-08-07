package com.miraprep.report.dto;

import jakarta.validation.constraints.NotNull;

public record ShareRequest(@NotNull Boolean enabled) {}
