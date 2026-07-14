package com.miraprep.resume;

import com.miraprep.common.response.ApiResponse;
import com.miraprep.resume.dto.ResumeDetailResponse;
import com.miraprep.resume.dto.ResumeListResponse;
import com.miraprep.resume.dto.ResumeSummaryResponse;
import com.miraprep.resume.dto.UpdateResumeRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/resumes")
public class ResumeController {
    private final ResumeService resumeService;

    public ResumeController(ResumeService resumeService) {
        this.resumeService = resumeService;
    }

    @PostMapping(consumes = "multipart/form-data")
    public ApiResponse<ResumeSummaryResponse> upload(
            @RequestPart("file") MultipartFile file, Authentication authentication) {
        return ApiResponse.ok(resumeService.upload(userId(authentication), file));
    }

    @GetMapping
    public ApiResponse<ResumeListResponse> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        return ApiResponse.ok(resumeService.list(userId(authentication), Math.max(1, page), Math.min(100, Math.max(1, size))));
    }

    @GetMapping("/{id}")
    public ApiResponse<ResumeDetailResponse> get(@PathVariable Long id, Authentication authentication) {
        return ApiResponse.ok(resumeService.get(userId(authentication), id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, Authentication authentication) {
        resumeService.delete(userId(authentication), id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}")
    public ApiResponse<ResumeSummaryResponse> update(
            @PathVariable Long id, @Valid @RequestBody UpdateResumeRequest request, Authentication authentication) {
        return ApiResponse.ok(resumeService.update(userId(authentication), id, request));
    }

    private Long userId(Authentication authentication) {
        return Long.parseLong(authentication.getName());
    }
}
