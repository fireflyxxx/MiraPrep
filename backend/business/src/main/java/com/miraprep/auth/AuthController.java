package com.miraprep.auth;

import com.miraprep.auth.dto.AuthResponse;
import com.miraprep.auth.dto.GitHubLoginRequest;
import com.miraprep.auth.dto.GoogleLoginRequest;
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
    private final GoogleOAuthService googleOAuthService;
    private final GitHubOAuthService gitHubOAuthService;

    public AuthController(
            AuthService authService,
            VerificationCodeService verificationCodeService,
            GoogleOAuthService googleOAuthService,
            GitHubOAuthService gitHubOAuthService) {
        this.authService = authService;
        this.verificationCodeService = verificationCodeService;
        this.googleOAuthService = googleOAuthService;
        this.gitHubOAuthService = gitHubOAuthService;
    }

    @PostMapping("/register")
    public ApiResponse<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ApiResponse.ok(authService.register(request));
    }

    @PostMapping("/login")
    public ApiResponse<AuthResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        return ApiResponse.ok(authService.login(request, httpRequest.getRemoteAddr()));
    }

    /** Google 登录（T-120）。请求体是 GIS 回调给前端的 ID Token，响应与邮箱登录同构。 */
    @PostMapping("/oauth/google")
    public ApiResponse<AuthResponse> loginWithGoogle(
            @Valid @RequestBody GoogleLoginRequest request, HttpServletRequest httpRequest) {
        return ApiResponse.ok(googleOAuthService.login(request.idToken(), httpRequest.getRemoteAddr()));
    }

    /** GitHub 登录（T-120）。请求体是授权码流程跳回前端回调页时带的 code。 */
    @PostMapping("/oauth/github")
    public ApiResponse<AuthResponse> loginWithGitHub(
            @Valid @RequestBody GitHubLoginRequest request, HttpServletRequest httpRequest) {
        return ApiResponse.ok(gitHubOAuthService.login(request.code(), httpRequest.getRemoteAddr()));
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
