package com.miraprep.client;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
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
    void interviewGradeRequestSerializesTheFrozenT105Contract() throws Exception {
        AiServiceClient.InterviewGradeRequest request = new AiServiceClient.InterviewGradeRequest(
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
                new AiServiceClient.InterviewOutlineResume(Map.of("skills", List.of("Java"))),
                List.of(new AiServiceClient.InterviewGradeTranscriptQuestion(
                        11L,
                        "domain_assessment",
                        List.of("事务"),
                        "如何保证回调幂等？",
                        "使用行锁和唯一约束。",
                        List.of(Map.of(
                                "question", "如果并发到达呢？",
                                "answer", "仍由数据库约束兜底。")))),
                true);

        JsonNode body = objectMapper.readTree(objectMapper.writeValueAsBytes(request));

        assertThat(body.path("sessionId").asLong()).isEqualTo(7L);
        assertThat(body.path("config").path("types").get(0).asText()).isEqualTo("technical");
        assertThat(body.path("resume").path("parsedJson").path("skills").get(0).asText())
                .isEqualTo("Java");
        assertThat(body.path("transcript").get(0).path("questionId").asLong()).isEqualTo(11L);
        assertThat(body.path("transcript").get(0).path("answer").asText())
                .isEqualTo("使用行锁和唯一约束。");
        assertThat(body.path("transcript").get(0).path("followUps").get(0).path("question").asText())
                .isEqualTo("如果并发到达呢？");
        assertThat(body.path("partial").asBoolean()).isTrue();
    }

    @Test
    void realAiRequestsStayOnHttp11WithoutAnH2cUpgrade() throws Exception {
        AtomicReference<String> upgradeHeader = new AtomicReference<>();
        AtomicReference<String> requestProtocol = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/internal/resumes/parse", exchange -> {
            upgradeHeader.set(exchange.getRequestHeaders().getFirst("Upgrade"));
            requestProtocol.set(exchange.getProtocol());
            exchange.getRequestBody().readAllBytes();
            exchange.sendResponseHeaders(202, -1);
            exchange.close();
        });
        server.start();
        try {
            AiServiceClient client = new AiServiceClient(
                    "http://127.0.0.1:" + server.getAddress().getPort(), "test-token");

            client.requestResumeParse(new AiServiceClient.ResumeParseRequest(
                    42L,
                    "https://minio.test/signed-download",
                    "candidate.pdf",
                    "application/pdf"));

            assertThat(requestProtocol.get()).isEqualTo("HTTP/1.1");
            assertThat(upgradeHeader.get()).isNull();
        } finally {
            server.stop(0);
        }
    }
}
