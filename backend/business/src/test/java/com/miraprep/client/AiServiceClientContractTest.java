package com.miraprep.client;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AiServiceClientContractTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void resumeParseRequestSerializesTheSignedUrlExpectedByTheAiService() throws Exception {
        AiServiceClient.ResumeParseRequest request = new AiServiceClient.ResumeParseRequest(
                42L,
                "https://minio.test/signed-download",
                "candidate.pdf",
                "application/pdf");

        JsonNode body = objectMapper.readTree(objectMapper.writeValueAsBytes(request));

        assertThat(body.path("resumeId").asLong()).isEqualTo(42L);
        assertThat(body.path("signedUrl").asText()).isEqualTo("https://minio.test/signed-download");
    }

    @Test
    void interviewOutlineRequestSerializesTheFrozenContract() throws Exception {
        AiServiceClient.InterviewOutlineRequest request = new AiServiceClient.InterviewOutlineRequest(
                7L,
                new AiServiceClient.InterviewOutlineConfig(
                        "backend",
                        "Java engineer",
                        "JD",
                        "medium",
                        List.of("technical"),
                        45,
                        "Spring",
                        "standard"),
                new AiServiceClient.InterviewOutlineResume(Map.of("skills", List.of("Java"))));

        JsonNode body = objectMapper.readTree(objectMapper.writeValueAsBytes(request));

        assertThat(body.path("sessionId").asLong()).isEqualTo(7L);
        assertThat(body.path("config").path("jobDirection").asText()).isEqualTo("backend");
        assertThat(body.path("config").path("durationMin").asInt()).isEqualTo(45);
        assertThat(body.path("resume").path("parsedJson").path("skills").get(0).asText())
                .isEqualTo("Java");
        assertThat(body.has("resumeId")).isFalse();
    }

    @Test
    void interviewGradeRequestSerializesTheSessionId() throws Exception {
        AiServiceClient.InterviewGradeRequest request = new AiServiceClient.InterviewGradeRequest(7L);

        JsonNode body = objectMapper.readTree(objectMapper.writeValueAsBytes(request));

        assertThat(body.path("sessionId").asLong()).isEqualTo(7L);
    }
}
