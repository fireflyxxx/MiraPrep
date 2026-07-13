package com.miraprep.user;

import com.miraprep.domain.User;
import com.miraprep.domain.UserProfile;
import com.miraprep.user.dto.UpdateUserProfileRequest;
import com.miraprep.user.dto.UserProfileResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserProfileService {
    private final UserService userService;
    private final UserProfileRepository userProfileRepository;

    public UserProfileService(UserService userService, UserProfileRepository userProfileRepository) {
        this.userService = userService;
        this.userProfileRepository = userProfileRepository;
    }

    @Transactional(readOnly = true)
    public UserProfileResponse getProfile(long userId) {
        return userProfileRepository.findById(userId).map(UserProfileResponse::from).orElseGet(UserProfileResponse::empty);
    }

    @Transactional
    public UserProfileResponse updateProfile(long userId, UpdateUserProfileRequest request) {
        User user = userService.getRequiredUser(userId);
        UserProfile profile = userProfileRepository.findById(userId).orElseGet(() -> {
            UserProfile created = new UserProfile();
            created.setUser(user);
            return created;
        });
        profile.setJobDirection(request.jobDirection());
        profile.setTechStacks(request.techStacks());
        profile.setExperienceLevel(request.experienceLevel());
        profile.setStatus(request.status());
        profile.setTargetCompany(request.targetCompany());
        profile.setPreferences(request.preferences());
        user.setFirstLogin(false);
        return UserProfileResponse.from(userProfileRepository.save(profile));
    }
}
