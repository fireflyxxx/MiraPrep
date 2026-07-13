package com.miraprep.user;

import com.miraprep.common.response.ApiResponse;
import com.miraprep.user.dto.UpdateUserProfileRequest;
import com.miraprep.user.dto.UpdateUserRequest;
import com.miraprep.user.dto.UserProfileResponse;
import com.miraprep.user.dto.UserResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users/me")
public class UserController {
    private final UserService userService;
    private final UserProfileService userProfileService;

    public UserController(UserService userService, UserProfileService userProfileService) {
        this.userService = userService;
        this.userProfileService = userProfileService;
    }

    @GetMapping
    public ApiResponse<UserResponse> getMe(@AuthenticationPrincipal String userId) {
        return ApiResponse.ok(userService.getMe(Long.parseLong(userId)));
    }

    @PutMapping
    public ApiResponse<UserResponse> updateMe(
            @AuthenticationPrincipal String userId, @Valid @RequestBody UpdateUserRequest request) {
        return ApiResponse.ok(userService.updateMe(Long.parseLong(userId), request));
    }

    @GetMapping("/profile")
    public ApiResponse<UserProfileResponse> getProfile(@AuthenticationPrincipal String userId) {
        return ApiResponse.ok(userProfileService.getProfile(Long.parseLong(userId)));
    }

    @PutMapping("/profile")
    public ApiResponse<UserProfileResponse> updateProfile(
            @AuthenticationPrincipal String userId, @Valid @RequestBody UpdateUserProfileRequest request) {
        return ApiResponse.ok(userProfileService.updateProfile(Long.parseLong(userId), request));
    }
}
