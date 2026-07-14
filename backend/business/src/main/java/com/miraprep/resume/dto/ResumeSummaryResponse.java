package com.miraprep.resume.dto;

import java.time.Instant;

public record ResumeSummaryResponse(
        Long id,
        String fileName,
        long fileSize,
        Integer pageCount,
        String parseStatus,
        boolean isDefault,
        Instant createdAt) {}
