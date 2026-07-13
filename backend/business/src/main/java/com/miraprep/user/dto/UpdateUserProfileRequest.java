package com.miraprep.user.dto;

import com.miraprep.domain.ExperienceLevel;
import com.miraprep.domain.ProfileStatus;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;

public record UpdateUserProfileRequest(
        @Size(max = 255) String jobDirection,
        List<@Size(max = 100) String> techStacks,
        ExperienceLevel experienceLevel,
        ProfileStatus status,
        @Size(max = 255) String targetCompany,
        Map<String, Object> preferences) {}
