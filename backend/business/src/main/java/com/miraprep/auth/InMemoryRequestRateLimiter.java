package com.miraprep.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.auth.rate-limiter", havingValue = "memory")
public class InMemoryRequestRateLimiter implements RequestRateLimiter {
    private final ConcurrentHashMap<String, Counter> counters = new ConcurrentHashMap<>();

    @Override
    public boolean tryAcquire(String key, int limit, Duration window) {
        Counter counter = counters.compute(key, (ignored, current) -> {
            if (current == null || current.expired()) {
                return new Counter(new AtomicInteger(1), Instant.now().plus(window));
            }
            current.count().incrementAndGet();
            return current;
        });
        return counter.count().get() <= limit;
    }

    @Override
    public void release(String key) {
        counters.computeIfPresent(key, (ignored, counter) -> {
            if (counter.expired() || counter.count().decrementAndGet() <= 0) {
                return null;
            }
            return counter;
        });
    }

    private record Counter(AtomicInteger count, Instant expiresAt) {
        boolean expired() {
            return !expiresAt.isAfter(Instant.now());
        }
    }
}
