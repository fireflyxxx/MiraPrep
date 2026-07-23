package com.miraprep.report.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record ReportResponse(
        Long sessionId,
        String grade,
        BigDecimal totalScore,
        String jobTitle,
        Instant createdAt,
        Config config,
        GradeResultRequest.DimensionScores dimensionScores,
        String summary,
        List<String> highlights,
        List<String> weaknesses,
        boolean partial,
        List<Question> questions) {

    public record Config(
            String jobDirection,
            String jobTitle,
            String jdText,
            String difficulty,
            List<String> types,
            int durationMin,
            String customRequirements,
            String interviewerStyle,
            boolean voiceEnabled) {}

    public record Question(
            Long questionId,
            int order,
            String phase,
            String text,
            List<String> focusPoints,
            String answer,
            BigDecimal score,
            Integer thinkSeconds,
            Integer answerSeconds,
            Integer suggestedSeconds,
            String referenceAnswer,
            List<String> suggestions,
            List<Object> followUpChain,
            String audioUrl) {}
}
