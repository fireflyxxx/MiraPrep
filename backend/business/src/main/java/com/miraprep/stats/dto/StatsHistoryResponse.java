package com.miraprep.stats.dto;

import java.time.Instant;
import java.util.List;

public record StatsHistoryResponse(List<HistoryPoint> points) {

    public record HistoryPoint(Long sessionId, Instant date, int score, String grade) {}
}
