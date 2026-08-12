package com.miraprep.auth.dto;

import jakarta.validation.constraints.NotBlank;

/** 前端 Google Identity Services 回调里拿到的 ID Token（credential 字段）。 */
public record GoogleLoginRequest(@NotBlank String idToken) {}
