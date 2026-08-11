package com.miraprep.interview.dto;

import java.math.BigDecimal;
import java.util.List;

public record PracticeResultResponse(
        String status,
        String question,
        Attempt source,
        Attempt current,
        BigDecimal scoreDelta) {

    public record Attempt(
            String answer,
            BigDecimal score,
            String referenceAnswer,
            List<String> suggestions) {}
}
