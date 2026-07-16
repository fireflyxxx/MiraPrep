package com.miraprep.client;

import java.util.List;
import java.util.Map;
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

    @Async("resumeParseExecutor")
    public void requestInterviewOutline(InterviewOutlineRequest request) {
        try {
            restClient.post()
                    .uri("/internal/interviews/{sessionId}/outline", request.sessionId())
                    .header("X-Internal-Token", internalToken)
                    .body(request)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception exception) {
            LOGGER.error("Failed to request outline for interview {}", request.sessionId(), exception);
        }
    }

    @Async("resumeParseExecutor")
    public void requestInterviewGrade(InterviewGradeRequest request) {
        try {
            restClient.post()
                    .uri("/internal/interviews/{sessionId}/grade", request.sessionId())
                    .header("X-Internal-Token", internalToken)
                    .body(request)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception exception) {
            LOGGER.error("Failed to request grading for interview {}", request.sessionId(), exception);
        }
    }

    public record ResumeParseRequest(Long resumeId, String signedUrl, String fileName, String mimeType) {}

    public record InterviewOutlineRequest(
            Long sessionId, InterviewOutlineConfig config, InterviewOutlineResume resume) {}

    public record InterviewOutlineConfig(
            String jobDirection,
            String jobTitle,
            String jdText,
            String difficulty,
            List<String> types,
            int durationMin,
            String customRequirements,
            String interviewerStyle) {}

    public record InterviewOutlineResume(Map<String, Object> parsedJson) {}

    public record InterviewGradeRequest(Long sessionId) {}
}
