package com.miraprep.auth;

import java.time.Duration;

/** Stores one-time auth state such as refresh-token ids and verification codes. */
public interface AuthTokenStore {
    void put(String key, String value, Duration ttl);

    /** Returns and invalidates the value so a refresh token cannot be replayed. */
    String consume(String key);

    String get(String key);

    void delete(String key);
}
