package com.miraprep.auth;

import java.time.Duration;

public interface RequestRateLimiter {
    /** Returns false once the request count has exceeded the allowed limit in this window. */
    boolean tryAcquire(String key, int limit, Duration window);

    /** Returns one permit when a request fails before it can be accepted. */
    void release(String key);
}
