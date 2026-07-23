package com.miraprep.report;

import com.miraprep.common.response.ApiResponse;
import com.miraprep.report.dto.ReportResponse;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {
    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    @GetMapping("/{sessionId}")
    public ApiResponse<ReportResponse> get(
            @PathVariable Long sessionId, Authentication authentication) {
        return ApiResponse.ok(
                reportService.get(Long.parseLong(authentication.getName()), sessionId));
    }
}
