package com.miraprep.interview;

import com.miraprep.common.response.ApiResponse;
import com.miraprep.interview.dto.CreatePracticeRequest;
import com.miraprep.interview.dto.CreatePracticeResponse;
import com.miraprep.interview.dto.PracticeResultResponse;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/interviews")
public class PracticeController {
    private final PracticeService practiceService;

    public PracticeController(PracticeService practiceService) {
        this.practiceService = practiceService;
    }

    @PostMapping("/{sessionId}/questions/{questionId}/retry")
    public ApiResponse<CreatePracticeResponse> retry(
            @PathVariable Long sessionId,
            @PathVariable Long questionId,
            @RequestBody(required = false) CreatePracticeRequest request,
            Authentication authentication) {
        return ApiResponse.ok(practiceService.create(
                Long.parseLong(authentication.getName()), sessionId, questionId, request));
    }

    @GetMapping("/{practiceSessionId}/practice-result")
    public ApiResponse<PracticeResultResponse> result(
            @PathVariable Long practiceSessionId, Authentication authentication) {
        return ApiResponse.ok(practiceService.result(
                Long.parseLong(authentication.getName()), practiceSessionId));
    }
}
