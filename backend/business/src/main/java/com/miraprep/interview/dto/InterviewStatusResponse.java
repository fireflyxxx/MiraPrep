package com.miraprep.interview.dto;

public record InterviewStatusResponse(Long sessionId, String status, String outlineStatus, long questionCount) {}
