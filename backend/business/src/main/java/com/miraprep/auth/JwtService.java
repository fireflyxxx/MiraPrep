package com.miraprep.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class JwtService {
    private static final String TOKEN_TYPE_CLAIM = "token_type";
    private final SecretKey secretKey;
    private final Duration accessTtl;
    private final Duration refreshTtl;

    public JwtService(
            @Value("${app.auth.jwt-secret}") String jwtSecret,
            @Value("${app.auth.access-ttl}") long accessTtlSeconds,
            @Value("${app.auth.refresh-ttl}") long refreshTtlSeconds) {
        this.secretKey = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
        this.accessTtl = Duration.ofSeconds(accessTtlSeconds);
        this.refreshTtl = Duration.ofSeconds(refreshTtlSeconds);
    }

    public String createAccessToken(long userId) {
        return createToken(userId, "access", UUID.randomUUID().toString(), accessTtl);
    }

    public IssuedRefreshToken createRefreshToken(long userId) {
        String tokenId = UUID.randomUUID().toString();
        return new IssuedRefreshToken(createToken(userId, "refresh", tokenId, refreshTtl), tokenId);
    }

    public JwtClaims parseAccessToken(String token) {
        return parse(token, "access");
    }

    public JwtClaims parseRefreshToken(String token) {
        return parse(token, "refresh");
    }

    public Duration refreshTtl() {
        return refreshTtl;
    }

    private String createToken(long userId, String type, String tokenId, Duration ttl) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(Long.toString(userId))
                .id(tokenId)
                .claim(TOKEN_TYPE_CLAIM, type)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)))
                .signWith(secretKey)
                .compact();
    }

    private JwtClaims parse(String token, String expectedType) {
        Claims claims = Jwts.parser().verifyWith(secretKey).build().parseSignedClaims(token).getPayload();
        if (!expectedType.equals(claims.get(TOKEN_TYPE_CLAIM, String.class))) {
            throw new JwtException("Unexpected token type");
        }
        try {
            return new JwtClaims(Long.parseLong(claims.getSubject()), claims.getId());
        } catch (NumberFormatException exception) {
            throw new JwtException("Invalid token subject", exception);
        }
    }
}
