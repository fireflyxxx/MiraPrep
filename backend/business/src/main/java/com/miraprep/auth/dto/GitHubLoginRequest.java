package com.miraprep.auth.dto;

import jakarta.validation.constraints.NotBlank;

/** GitHub 授权后跳回前端回调页时带的 code。state 由前端自行比对，不进后端。 */
public record GitHubLoginRequest(@NotBlank String code) {}
