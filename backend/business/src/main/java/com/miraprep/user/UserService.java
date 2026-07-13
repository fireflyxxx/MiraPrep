package com.miraprep.user;

import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import com.miraprep.domain.User;
import com.miraprep.user.dto.UpdateUserRequest;
import com.miraprep.user.dto.UserResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {
    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public User getRequiredUser(long userId) {
        return userRepository.findById(userId).orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
    }

    @Transactional(readOnly = true)
    public UserResponse getMe(long userId) {
        return UserResponse.from(getRequiredUser(userId));
    }

    @Transactional
    public UserResponse updateMe(long userId, UpdateUserRequest request) {
        User user = getRequiredUser(userId);
        if (request.nickname() != null) {
            user.setNickname(request.nickname());
        }
        if (request.avatar() != null) {
            user.setAvatar(request.avatar());
        }
        return UserResponse.from(user);
    }
}
