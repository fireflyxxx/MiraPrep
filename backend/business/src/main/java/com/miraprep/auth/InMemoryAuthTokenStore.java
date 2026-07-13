package com.miraprep.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Used only by tests; production uses Redis so state is shared between application instances. */
@Component
@ConditionalOnProperty(name = "app.auth.token-store", havingValue = "memory")
public class InMemoryAuthTokenStore implements AuthTokenStore {
    private final ConcurrentHashMap<String, ExpiringValue> values = new ConcurrentHashMap<>();

    @Override
    public void put(String key, String value, Duration ttl) {
        values.put(key, new ExpiringValue(value, Instant.now().plus(ttl)));
    }

    @Override
    public String consume(String key) {
        ExpiringValue value = values.remove(key);
        return value != null && !value.expired() ? value.value() : null;
    }

    @Override
    public String get(String key) {
        ExpiringValue value = values.get(key);
        if (value == null || value.expired()) {
            values.remove(key, value);
            return null;
        }
        return value.value();
    }

    @Override
    public void delete(String key) {
        values.remove(key);
    }

    private record ExpiringValue(String value, Instant expiresAt) {
        boolean expired() {
            return !expiresAt.isAfter(Instant.now());
        }
    }
}
