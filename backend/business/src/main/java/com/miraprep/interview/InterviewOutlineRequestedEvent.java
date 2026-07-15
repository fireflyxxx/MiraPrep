package com.miraprep.interview;

import com.miraprep.client.AiServiceClient;

public record InterviewOutlineRequestedEvent(AiServiceClient.InterviewOutlineRequest request) {}
