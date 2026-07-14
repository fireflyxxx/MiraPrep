package com.miraprep.resume.dto;

import java.time.Instant;
import java.util.Map;

public record ResumeDetailResponse(
        Long id,
        String fileName,
        long fileSize,
        Integer pageCount,
        String parseStatus,
        boolean isDefault,
        Instant createdAt,
        Map<String, Object> parsedJson,
        String downloadUrl) {}
