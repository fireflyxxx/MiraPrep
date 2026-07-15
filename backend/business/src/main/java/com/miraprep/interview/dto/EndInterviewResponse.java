package com.miraprep.interview.dto;

import java.time.Instant;

public record EndInterviewResponse(Long sessionId, String status, String reportStatus, Instant endedAt) {}
