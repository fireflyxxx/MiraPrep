package com.miraprep.auth;

public record JwtClaims(long userId, String tokenId) {}
