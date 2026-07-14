package com.miraprep.resume.dto;

import java.util.List;

public record ResumeListResponse(List<ResumeSummaryResponse> items, long total, int page, int size) {}
