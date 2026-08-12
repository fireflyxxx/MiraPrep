package com.miraprep.interview.dto;

import java.math.BigDecimal;
import java.util.List;

public record PracticeResultResponse(
        String status,
        String targetType,
        Integer followUpIndex,
        String question,
        Attempt source,
        Attempt current,
        AnswerComparison comparison,
        BigDecimal scoreDelta) {

    public record Attempt(
            String answer,
            BigDecimal score,
            String referenceAnswer,
            List<String> suggestions,
            List<FollowUp> followUps) {}

    public record FollowUp(
            String question,
            String answer,
            BigDecimal score,
            String referenceAnswer,
            List<String> suggestions) {}

    public record AnswerComparison(
            List<String> improvements,
            List<String> remainingGaps,
            String scoreRationale) {}
}
