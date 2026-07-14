package com.miraprep.client;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
}
