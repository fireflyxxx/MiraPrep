package com.miraprep.auth;

import com.miraprep.auth.dto.AuthResponse;
import com.miraprep.auth.dto.LoginRequest;
import com.miraprep.auth.dto.RefreshRequest;
import com.miraprep.auth.dto.RefreshResponse;
import com.miraprep.auth.dto.RegisterRequest;
import com.miraprep.auth.dto.SendVerificationCodeRequest;
import com.miraprep.common.response.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService authService;
    private final VerificationCodeService verificationCodeService;

    public AuthController(AuthService authService, VerificationCodeService verificationCodeService) {
        this.authService = authService;
        this.verificationCodeService = verificationCodeService;
    }

    @PostMapping("/register")
    public ApiResponse<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ApiResponse.ok(authService.register(request));
    }

    @PostMapping("/login")
    public ApiResponse<AuthResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        return ApiResponse.ok(authService.login(request, httpRequest.getRemoteAddr()));
    }

    @PostMapping("/refresh")
    public ApiResponse<RefreshResponse> refresh(@Valid @RequestBody RefreshRequest request) {
        return ApiResponse.ok(authService.refresh(request.refreshToken()));
    }

    @PostMapping("/send-code")
    public ApiResponse<Map<String, Object>> sendCode(
            @Valid @RequestBody SendVerificationCodeRequest request, HttpServletRequest httpRequest) {
        verificationCodeService.sendCode(request.email(), request.scene(), httpRequest.getRemoteAddr());
        return ApiResponse.ok(Map.of());
    }
}
