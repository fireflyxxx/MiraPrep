package com.miraprep.stats;

import com.miraprep.common.response.ApiResponse;
import com.miraprep.stats.dto.StatsHistoryResponse;
import com.miraprep.stats.dto.StatsOverviewResponse;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/stats")
public class StatsController {
    private final StatsService statsService;

    public StatsController(StatsService statsService) {
        this.statsService = statsService;
    }

    @GetMapping("/overview")
    public ApiResponse<StatsOverviewResponse> overview(Authentication authentication) {
        return ApiResponse.ok(statsService.overview(Long.parseLong(authentication.getName())));
    }

    @GetMapping("/history")
    public ApiResponse<StatsHistoryResponse> history(
            @RequestParam(required = false) String jobDirection,
            @RequestParam(required = false) String jobTitle,
            Authentication authentication) {
        return ApiResponse.ok(statsService.history(
                Long.parseLong(authentication.getName()), jobDirection, jobTitle));
    }
}
