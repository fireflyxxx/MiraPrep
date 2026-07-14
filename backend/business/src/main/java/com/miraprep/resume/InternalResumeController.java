package com.miraprep.resume;

import com.miraprep.common.response.ApiResponse;
import com.miraprep.resume.dto.ParseResultRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/internal/resumes")
public class InternalResumeController {
    private final ResumeService resumeService;

    public InternalResumeController(ResumeService resumeService) {
        this.resumeService = resumeService;
    }

    @PostMapping("/{id}/parse-result")
    public ApiResponse<Void> acceptParseResult(@PathVariable Long id, @Valid @RequestBody ParseResultRequest request) {
        resumeService.applyParseResult(id, request);
        return ApiResponse.ok(null);
    }
}
