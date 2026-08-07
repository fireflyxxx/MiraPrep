package com.miraprep.report;

import com.miraprep.common.response.ApiResponse;
import com.miraprep.report.dto.ReportResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 公开只读报告。这是整个服务里唯一不需要登录的业务接口，所以刻意单独放一个 Controller：
 * 以后任何人加接口时，都能一眼看出「这个类里的东西是全世界可见的」。
 *
 * <p>只有 GET。分享页不提供任何写操作，拿到 token 也改不了任何数据。
 */
@RestController
@RequestMapping("/api/v1/public/reports")
public class PublicReportController {
    private final ShareService shareService;

    public PublicReportController(ShareService shareService) {
        this.shareService = shareService;
    }

    @GetMapping("/{shareToken}")
    public ApiResponse<ReportResponse> get(@PathVariable String shareToken) {
        return ApiResponse.ok(shareService.publicReport(shareToken));
    }
}
