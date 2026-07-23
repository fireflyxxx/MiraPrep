package com.miraprep.interview;

import com.miraprep.client.AiServiceClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class InterviewAiRequestListener {
    private final AiServiceClient aiServiceClient;

    public InterviewAiRequestListener(AiServiceClient aiServiceClient) {
        this.aiServiceClient = aiServiceClient;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void requestOutline(InterviewOutlineRequestedEvent event) {
        aiServiceClient.requestInterviewOutline(event.request());
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void requestGrading(InterviewGradingRequestedEvent event) {
        aiServiceClient.requestInterviewGrade(event.request());
    }
}
