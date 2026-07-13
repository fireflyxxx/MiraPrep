package com.miraprep.user.dto;

import com.miraprep.domain.User;

public record UserResponse(Long id, String email, String nickname, String avatar, boolean isFirstLogin) {
    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getEmail(), user.getNickname(), user.getAvatar(), user.isFirstLogin());
    }
}
