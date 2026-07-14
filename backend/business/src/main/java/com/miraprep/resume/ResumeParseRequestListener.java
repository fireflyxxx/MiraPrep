package com.miraprep.resume;

import com.miraprep.client.AiServiceClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class ResumeParseRequestListener {
    private static final Logger LOGGER = LoggerFactory.getLogger(ResumeParseRequestListener.class);
    private final ObjectStorageService objectStorageService;
    private final AiServiceClient aiServiceClient;

    public ResumeParseRequestListener(ObjectStorageService objectStorageService, AiServiceClient aiServiceClient) {
        this.objectStorageService = objectStorageService;
        this.aiServiceClient = aiServiceClient;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void requestParseAfterCommit(ResumeParseRequestedEvent event) {
        try {
            String signedUrl = objectStorageService.signedDownloadUrl(event.objectKey());
            aiServiceClient.requestResumeParse(new AiServiceClient.ResumeParseRequest(
                    event.resumeId(), signedUrl, event.fileName(), event.mimeType()));
        } catch (Exception exception) {
            LOGGER.error("Failed to prepare parsing request for committed resume {}", event.resumeId(), exception);
        }
    }
}
