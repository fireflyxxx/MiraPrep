package com.miraprep.interview.dto;

/**
 * `runtimeToken` 是 T-040 约定的会话专用令牌，前端拿它直连 FastAPI 运行时。
 * 创建时即返回（前端存 sessionStorage），Spring 在大纲就绪后把同一个令牌交接给 AI 服务。
 */
public record CreateInterviewResponse(Long sessionId, String outlineStatus, String runtimeToken) {}
