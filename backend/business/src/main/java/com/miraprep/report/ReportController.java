package com.miraprep.report;

import com.miraprep.common.response.ApiResponse;
import com.miraprep.report.dto.ReportResponse;
import com.miraprep.report.dto.ReportStatusResponse;
import com.miraprep.report.dto.ShareRequest;
import com.miraprep.report.dto.ShareResponse;
import jakarta.validation.Valid;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {
    private final ReportService reportService;
    private final ReportExportService reportExportService;
    private final ShareService shareService;

    public ReportController(
            ReportService reportService,
            ReportExportService reportExportService,
            ShareService shareService) {
        this.reportService = reportService;
        this.reportExportService = reportExportService;
        this.shareService = shareService;
    }

    @GetMapping("/{sessionId}")
    public ApiResponse<ReportResponse> get(
            @PathVariable Long sessionId, Authentication authentication) {
        return ApiResponse.ok(
                reportService.get(Long.parseLong(authentication.getName()), sessionId));
    }

    /** 唯一一个不走统一 JSON 信封的报告接口：响应体就是 PDF 本身。 */
    @GetMapping(value = "/{sessionId}/export", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> export(
            @PathVariable Long sessionId, Authentication authentication) {
        byte[] pdf =
                reportExportService.export(Long.parseLong(authentication.getName()), sessionId);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment()
                                .filename(reportExportService.fileName(sessionId))
                                .build()
                                .toString())
                .body(pdf);
    }

    @GetMapping("/{sessionId}/share")
    public ApiResponse<ShareResponse> shareStatus(
            @PathVariable Long sessionId, Authentication authentication) {
        return ApiResponse.ok(
                shareService.status(Long.parseLong(authentication.getName()), sessionId));
    }

    @PostMapping("/{sessionId}/share")
    public ApiResponse<ShareResponse> setShared(
            @PathVariable Long sessionId,
            @Valid @RequestBody ShareRequest request,
            Authentication authentication) {
        return ApiResponse.ok(shareService.setShared(
                Long.parseLong(authentication.getName()), sessionId, request.enabled()));
    }

    @GetMapping("/{sessionId}/status")
    public ApiResponse<ReportStatusResponse> status(
            @PathVariable Long sessionId, Authentication authentication) {
        return ApiResponse.ok(
                reportService.status(Long.parseLong(authentication.getName()), sessionId));
    }
}
