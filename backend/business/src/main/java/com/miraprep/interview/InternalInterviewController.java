package com.miraprep.interview;

import com.miraprep.common.response.ApiResponse;
import com.miraprep.interview.dto.InterviewMessageResponse;
import com.miraprep.interview.dto.OutlineResultRequest;
import com.miraprep.interview.dto.WriteInterviewMessageRequest;
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

    public InternalInterviewController(
            InterviewService interviewService, InterviewMessageService interviewMessageService) {
        this.interviewService = interviewService;
        this.interviewMessageService = interviewMessageService;
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
}
