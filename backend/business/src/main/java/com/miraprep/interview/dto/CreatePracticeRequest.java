package com.miraprep.interview.dto;

import com.miraprep.domain.PracticeTargetType;

public record CreatePracticeRequest(PracticeTargetType targetType, Integer followUpIndex) {
    public static CreatePracticeRequest mainQuestion() {
        return new CreatePracticeRequest(PracticeTargetType.MAIN_QUESTION, null);
    }
}
