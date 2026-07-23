package com.miraprep.interview;

import com.miraprep.common.response.ApiResponse;
import com.miraprep.interview.dto.InterviewMessageResponse;
import com.miraprep.interview.dto.OutlineResultRequest;
import com.miraprep.interview.dto.RuntimeGradingRequest;
import com.miraprep.interview.dto.WriteInterviewMessageRequest;
import com.miraprep.report.ReportService;
import com.miraprep.report.dto.GradeFailedRequest;
import com.miraprep.report.dto.GradeResultRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/internal/interviews")
public class InternalInterviewController {
    private final InterviewService interviewService;
    private final InterviewMessageService interviewMessageService;
    private final ReportService reportService;

    public InternalInterviewController(
            InterviewService interviewService,
            InterviewMessageService interviewMessageService,
            ReportService reportService) {
        this.interviewService = interviewService;
        this.interviewMessageService = interviewMessageService;
        this.reportService = reportService;
    }

    @PostMapping("/{id}/outline-result")
    public ApiResponse<Void> outlineResult(
            @PathVariable Long id, @Valid @RequestBody OutlineResultRequest request) {
        interviewService.applyOutlineResult(id, request);
        return ApiResponse.ok(null);
    }

    @PostMapping("/{id}/messages")
    public ApiResponse<InterviewMessageResponse> writeMessage(
            @PathVariable Long id, @Valid @RequestBody WriteInterviewMessageRequest request) {
        return ApiResponse.ok(interviewMessageService.write(id, request));
    }

    @PostMapping("/{id}/grading-request")
    public ApiResponse<Void> requestGrading(
            @PathVariable Long id, @Valid @RequestBody RuntimeGradingRequest request) {
        interviewService.requestGradingFromRuntime(id, request);
        return ApiResponse.ok(null);
    }

    @PostMapping("/{id}/grade-result")
    public ApiResponse<Void> gradeResult(
            @PathVariable Long id, @Valid @RequestBody GradeResultRequest request) {
        reportService.applyGradeResult(id, request);
        return ApiResponse.ok(null);
    }

    @PostMapping("/{id}/grade-failed")
    public ApiResponse<Void> gradeFailed(
            @PathVariable Long id, @Valid @RequestBody GradeFailedRequest request) {
        reportService.applyGradeFailure(id, request);
        return ApiResponse.ok(null);
    }
}
