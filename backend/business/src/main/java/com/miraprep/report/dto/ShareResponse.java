package com.miraprep.report.dto;

/** 分享关闭时 token 与 url 都是 null，前端据此决定显示「开启分享」还是链接和复制按钮。 */
public record ShareResponse(boolean enabled, String shareToken, String shareUrl) {}
