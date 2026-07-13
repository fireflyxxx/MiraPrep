package com.miraprep.user.dto;

import com.miraprep.domain.UserProfile;
import java.util.List;
import java.util.Map;

public record UserProfileResponse(
        String jobDirection,
        List<String> techStacks,
        String experienceLevel,
        String status,
        String targetCompany,
        Map<String, Object> preferences) {
    public static UserProfileResponse empty() {
        return new UserProfileResponse(null, List.of(), null, null, null, Map.of());
    }

    public static UserProfileResponse from(UserProfile profile) {
        return new UserProfileResponse(
                profile.getJobDirection(),
                profile.getTechStacks() == null ? List.of() : profile.getTechStacks(),
                profile.getExperienceLevel() == null ? null : profile.getExperienceLevel().name(),
                profile.getStatus() == null ? null : profile.getStatus().name(),
                profile.getTargetCompany(),
                profile.getPreferences() == null ? Map.of() : profile.getPreferences());
    }
}
