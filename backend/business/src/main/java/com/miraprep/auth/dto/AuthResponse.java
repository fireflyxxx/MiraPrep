package com.miraprep.auth.dto;

import com.miraprep.user.dto.UserResponse;

public record AuthResponse(String accessToken, String refreshToken, UserResponse user) {}
