package com.miraprep.interview.dto;

import java.time.Instant;

public record InterviewListItemResponse(
        Long sessionId,
        String jobTitle,
        String difficulty,
        int durationMin,
        Long actualDurationSeconds,
        long questionCount,
        String status,
        String grade,
        String reportStatus,
        Instant createdAt,
        Instant endedAt) {}
