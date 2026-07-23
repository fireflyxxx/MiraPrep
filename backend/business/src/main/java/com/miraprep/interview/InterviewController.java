package com.miraprep.interview;

import com.miraprep.common.response.ApiResponse;
import com.miraprep.interview.dto.CreateInterviewRequest;
import com.miraprep.interview.dto.CreateInterviewResponse;
import com.miraprep.interview.dto.EndInterviewRequest;
import com.miraprep.interview.dto.EndInterviewResponse;
import com.miraprep.interview.dto.InterviewListResponse;
import com.miraprep.interview.dto.InterviewMessagesResponse;
import com.miraprep.interview.dto.InterviewStatusResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/interviews")
public class InterviewController {
    private final InterviewService interviewService;
    private final InterviewMessageService interviewMessageService;

    public InterviewController(
            InterviewService interviewService, InterviewMessageService interviewMessageService) {
        this.interviewService = interviewService;
        this.interviewMessageService = interviewMessageService;
    }

    @PostMapping
    public ApiResponse<CreateInterviewResponse> create(
            @Valid @RequestBody CreateInterviewRequest request, Authentication authentication) {
        return ApiResponse.ok(interviewService.create(userId(authentication), request));
    }

    @GetMapping("/{id}/status")
    public ApiResponse<InterviewStatusResponse> status(@PathVariable Long id, Authentication authentication) {
        return ApiResponse.ok(interviewService.status(userId(authentication), id));
    }

    @GetMapping("/{id}/messages")
    public ApiResponse<InterviewMessagesResponse> messages(
            @PathVariable Long id,
            @RequestParam(defaultValue = "0") int afterSeq,
            Authentication authentication) {
        return ApiResponse.ok(interviewMessageService.read(userId(authentication), id, afterSeq));
    }

    @PostMapping("/{id}/end")
    public ApiResponse<EndInterviewResponse> end(
            @PathVariable Long id,
            @Valid @RequestBody EndInterviewRequest request,
            Authentication authentication) {
        return ApiResponse.ok(interviewService.end(userId(authentication), id, request));
    }

    @GetMapping
    public ApiResponse<InterviewListResponse> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            Authentication authentication) {
        int normalizedPage = Math.max(1, page);
        int normalizedSize = Math.min(100, Math.max(1, size));
        return ApiResponse.ok(interviewService.list(userId(authentication), normalizedPage, normalizedSize, status));
    }

    private Long userId(Authentication authentication) {
        return Long.parseLong(authentication.getName());
    }
}
