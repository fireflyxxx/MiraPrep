package com.miraprep.stats;

import com.miraprep.domain.InterviewSession;
import com.miraprep.domain.InterviewStatus;
import com.miraprep.domain.Report;
import com.miraprep.interview.InterviewSessionRepository;
import com.miraprep.report.ReportRepository;
import com.miraprep.report.dto.GradeResultRequest;
import com.miraprep.stats.dto.StatsOverviewResponse;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StatsService {
    private static final List<String> DIMENSION_KEYS = List.of(
            "professionalKnowledge",
            "projectDepth",
            "communicationLogic",
            "adaptability",
            "jobFit");
    private static final Map<String, String> DIMENSION_LABELS = Map.of(
            "professionalKnowledge", "专业知识",
            "projectDepth", "项目深度",
            "communicationLogic", "表达逻辑",
            "adaptability", "临场应变",
            "jobFit", "岗位匹配度");

    private final InterviewSessionRepository sessionRepository;
    private final ReportRepository reportRepository;

    public StatsService(
            InterviewSessionRepository sessionRepository, ReportRepository reportRepository) {
        this.sessionRepository = sessionRepository;
        this.reportRepository = reportRepository;
    }

    @Transactional(readOnly = true)
    public StatsOverviewResponse overview(Long userId) {
        List<InterviewSession> endedSessions =
                sessionRepository.findByUserIdAndDeletedFalseAndStatusIn(
                        userId, List.of(InterviewStatus.COMPLETED, InterviewStatus.ABORTED));
        long practiceSeconds = endedSessions.stream()
                .filter(session -> session.getStartedAt() != null && session.getEndedAt() != null)
                .mapToLong(session ->
                        Math.max(0, Duration.between(session.getStartedAt(), session.getEndedAt()).toSeconds()))
                .sum();
        long practiceMinutes = practiceSeconds / 60;

        List<Report> newestFirst =
                reportRepository.findRecentCompleteReports(userId, PageRequest.of(0, 10));
        if (newestFirst.isEmpty()) {
            return new StatsOverviewResponse(
                    endedSessions.size(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    0,
                    null,
                    List.of(),
                    practiceMinutes);
        }

        List<Report> reports = new ArrayList<>(newestFirst);
        java.util.Collections.reverse(reports);
        Report latest = reports.get(reports.size() - 1);
        Report highest = reports.stream()
                .max(java.util.Comparator.comparing(Report::getTotalScore))
                .orElseThrow();
        GradeResultRequest.DimensionScores dimensions = averageDimensions(reports);
        int weightedScore = weightedScore(reports);
        List<StatsOverviewResponse.ScoreTrendPoint> trend = reports.stream()
                .map(report -> new StatsOverviewResponse.ScoreTrendPoint(
                        report.getSession().getEndedAt().atZone(ZoneOffset.UTC).toLocalDate(),
                        report.getTotalScore().setScale(0, RoundingMode.HALF_UP).intValue()))
                .toList();

        return new StatsOverviewResponse(
                endedSessions.size(),
                highest.getGrade().name(),
                latest.getGrade().name(),
                latest.getSession().getEndedAt(),
                gradeForScore(weightedScore),
                summary(reports.size(), dimensions),
                reports.size(),
                dimensions,
                trend,
                practiceMinutes);
    }

    private GradeResultRequest.DimensionScores averageDimensions(List<Report> reports) {
        Map<String, Integer> averages = new LinkedHashMap<>();
        for (String key : DIMENSION_KEYS) {
            BigDecimal total = reports.stream()
                    .map(report -> number(report, key))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            averages.put(
                    key,
                    total.divide(BigDecimal.valueOf(reports.size()), 0, RoundingMode.HALF_UP)
                            .intValue());
        }
        return new GradeResultRequest.DimensionScores(
                averages.get("professionalKnowledge"),
                averages.get("projectDepth"),
                averages.get("communicationLogic"),
                averages.get("adaptability"),
                averages.get("jobFit"));
    }

    private int weightedScore(List<Report> reports) {
        BigDecimal weightedTotal = BigDecimal.ZERO;
        int weightTotal = 0;
        for (int index = 0; index < reports.size(); index++) {
            int weight = index + 1;
            weightedTotal = weightedTotal.add(
                    reports.get(index).getTotalScore().multiply(BigDecimal.valueOf(weight)));
            weightTotal += weight;
        }
        return weightedTotal
                .divide(BigDecimal.valueOf(weightTotal), 0, RoundingMode.HALF_UP)
                .intValue();
    }

    private String summary(int reportCount, GradeResultRequest.DimensionScores scores) {
        Map<String, Integer> values = new LinkedHashMap<>();
        values.put("professionalKnowledge", scores.professionalKnowledge());
        values.put("projectDepth", scores.projectDepth());
        values.put("communicationLogic", scores.communicationLogic());
        values.put("adaptability", scores.adaptability());
        values.put("jobFit", scores.jobFit());
        String highest = DIMENSION_KEYS.stream()
                .max(java.util.Comparator.comparingInt(values::get))
                .orElseThrow();
        String lowest = DIMENSION_KEYS.stream()
                .min(java.util.Comparator.comparingInt(values::get))
                .orElseThrow();
        return "基于最近 %d 场：%s表现突出，%s仍有提升空间。"
                .formatted(
                        reportCount,
                        DIMENSION_LABELS.get(highest),
                        DIMENSION_LABELS.get(lowest));
    }

    private BigDecimal number(Report report, String key) {
        Object value = report.getDimensionScores().get(key);
        if (!(value instanceof Number number)) {
            throw new IllegalStateException("Missing report dimension: " + key);
        }
        return new BigDecimal(number.toString());
    }

    private String gradeForScore(int score) {
        if (score >= 90) {
            return "S";
        }
        if (score >= 80) {
            return "A";
        }
        if (score >= 70) {
            return "B";
        }
        if (score >= 60) {
            return "C";
        }
        return "D";
    }
}
