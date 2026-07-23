package com.miraprep.interview.dto;

import java.time.Instant;

public record InterviewMessageResponse(
        String role,
        String content,
        String phase,
        Long questionId,
        String audioUrl,
        int seq,
        Instant createdAt) {}
