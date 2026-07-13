package com.miraprep.web.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.response.ApiResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class InternalTokenFilter extends OncePerRequestFilter {
    private static final String INTERNAL_PATH_PREFIX = "/api/v1/internal/";
    private final ObjectMapper objectMapper;
    private final byte[] expectedToken;

    public InternalTokenFilter(
            ObjectMapper objectMapper, @Value("${app.internal-token:}") String internalToken) {
        this.objectMapper = objectMapper;
        this.expectedToken = internalToken.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(INTERNAL_PATH_PREFIX);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String providedToken = request.getHeader("X-Internal-Token");
        boolean matches = expectedToken.length > 0
                && providedToken != null
                && MessageDigest.isEqual(expectedToken, providedToken.getBytes(StandardCharsets.UTF_8));
        if (!matches) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(objectMapper.writeValueAsString(ApiResponse.fail(ErrorCode.FORBIDDEN)));
            return;
        }
        filterChain.doFilter(request, response);
    }
}
