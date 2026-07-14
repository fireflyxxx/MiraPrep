package com.miraprep.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class AiServiceClient {
    private static final Logger LOGGER = LoggerFactory.getLogger(AiServiceClient.class);
    private final RestClient restClient;
    private final String internalToken;

    public AiServiceClient(
            @Value("${app.ai-service.base-url}") String baseUrl,
            @Value("${app.internal-token:}") String internalToken) {
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
        this.internalToken = internalToken;
    }

    @Async("resumeParseExecutor")
    public void requestResumeParse(ResumeParseRequest request) {
        try {
            restClient.post()
                    .uri("/internal/resumes/parse")
                    .header("X-Internal-Token", internalToken)
                    .body(request)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception exception) {
            LOGGER.error("Failed to request parsing for resume {}", request.resumeId(), exception);
        }
    }

    public record ResumeParseRequest(Long resumeId, String signedUrl, String fileName, String mimeType) {}
}
