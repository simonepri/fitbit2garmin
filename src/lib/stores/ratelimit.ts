import { writable } from 'svelte/store';

export interface RateLimitState {
    limit: number;
    remaining: number;
    resetAt: number; // UTC timestamp in milliseconds
}

function createRateLimitStore() {
    const { subscribe, set, update } = writable<RateLimitState>({
        limit: 150,
        remaining: 150,
        resetAt: Date.now() + 3600 * 1000
    });

    function updateFromHeaders(headers: Headers) {
        const limit = headers.get('fitbit-rate-limit-limit');
        const remaining = headers.get('fitbit-rate-limit-remaining');
        const reset = headers.get('fitbit-rate-limit-reset'); // in seconds

        if (limit !== null && remaining !== null && reset !== null) {
            const resetAt = Date.now() + parseInt(reset, 10) * 1000;
            set({
                limit: parseInt(limit, 10),
                remaining: parseInt(remaining, 10),
                resetAt
            });
        }
    }

    return {
        subscribe,
        updateFromHeaders,
        set // for testing
    };
}

export const ratelimit = createRateLimitStore();
