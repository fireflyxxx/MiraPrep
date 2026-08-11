package com.miraprep.client;

import java.net.http.HttpClient;
import java.util.List;
import java.util.Map;
import org.springframework.http.client.JdkClientHttpRequestFactory;
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
        HttpClient httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .build();
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(new JdkClientHttpRequestFactory(httpClient))
                .build();
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

    /** 大纲就绪后把会话令牌与出题上下文交接给运行时（T-040 §传输选择）。 */
    @Async("resumeParseExecutor")
    public void startInterviewRuntime(InterviewStartRequest request) {
        try {
            restClient.post()
                    .uri("/internal/interviews/{sessionId}/start", request.sessionId())
                    .header("X-Internal-Token", internalToken)
                    .body(request)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception exception) {
            LOGGER.error("Failed to start runtime for interview {}", request.sessionId(), exception);
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

    /**
     * 运行时启动载荷。`config` 与 `resume` 让 AI 侧能在面试过程中动态出题，
     * 因此这里只带已经定稿的开场题，其余题目由运行时按阶段预算现场生成。
     */
    public record InterviewStartRequest(
            Long sessionId,
            String mode,
            String accessToken,
            int durationMin,
            String interviewerStyle,
            InterviewOutlineConfig config,
            InterviewOutlineResume resume,
            List<InterviewStartQuestion> questions) {}

    public record InterviewStartQuestion(
            Long questionId, String phase, String text, List<String> focusPoints, int order) {}

    public record InterviewGradeRequest(
            Long sessionId,
            InterviewOutlineConfig config,
            InterviewOutlineResume resume,
            List<InterviewGradeTranscriptQuestion> transcript,
            boolean partial) {}

    public record InterviewGradeTranscriptQuestion(
            Long questionId,
            String phase,
            List<String> focusPoints,
            String question,
            String answer,
            List<Map<String, Object>> followUps) {}
}
