package com.miraprep.interview;

import com.miraprep.client.AiServiceClient;

public record InterviewGradingRequestedEvent(AiServiceClient.InterviewGradeRequest request) {}
