package com.miraprep.interview;

import com.miraprep.client.AiServiceClient;

public record InterviewRuntimeStartRequestedEvent(AiServiceClient.InterviewStartRequest request) {}
