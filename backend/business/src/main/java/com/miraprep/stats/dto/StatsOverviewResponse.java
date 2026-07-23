package com.miraprep.stats.dto;

import com.miraprep.report.dto.GradeResultRequest;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record StatsOverviewResponse(
        long totalInterviews,
        String highestGrade,
        String latestGrade,
        Instant lastInterviewAt,
        String overallGrade,
        String overallSummary,
        int basedOnCompletedInterviews,
        GradeResultRequest.DimensionScores dimensionScores,
        List<ScoreTrendPoint> scoreTrend,
        long totalPracticeMinutes) {

    public record ScoreTrendPoint(LocalDate date, int score) {}
}
