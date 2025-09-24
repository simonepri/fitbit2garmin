import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { RateLimiter } from './ratelimiter';

describe('RateLimiter', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should allow requests up to the limit', async () => {
		const limiter = new RateLimiter(5, 3600);
		const promises = [];
		for (let i = 0; i < 5; i++) {
			promises.push(limiter.acquire());
		}
		await Promise.all(promises);
		// @ts-expect-error accessing private property
		expect(limiter.remaining).toBe(0);
	});

	it('should block requests over the limit and wait for reset', async () => {
		const limiter = new RateLimiter(2, 3600);
		await limiter.acquire();
		await limiter.acquire();

		const start = Date.now();
		const p = limiter.acquire();

        // The promise should not resolve yet
        let resolved = false;
        p.then(() => resolved = true);

        await vi.advanceTimersByTimeAsync(100);
        expect(resolved).toBe(false);

		// Advance time to just before the reset
        await vi.advanceTimersByTimeAsync(3600 * 1000 - 200);
        expect(resolved).toBe(false);

        // Advance time past the reset
        await vi.advanceTimersByTimeAsync(200);

		await p; // Now it should resolve
		const end = Date.now();

		expect(end - start).toBeGreaterThanOrEqual(3600 * 1000);
	}, 10000); // Increase timeout for this specific test

	it('should reset remaining requests after the reset time', async () => {
		const limiter = new RateLimiter(2, 1); // 1 second reset
		await limiter.acquire();
		await limiter.acquire();

		// @ts-expect-error accessing private property
		expect(limiter.remaining).toBe(0);

		const p = limiter.acquire();
		vi.advanceTimersByTime(1001);
		await p;

		// @ts-expect-error accessing private property
		expect(limiter.remaining).toBe(1);
	});

	it('should update limits from headers', () => {
		const limiter = new RateLimiter();
		const headers = new Headers({
			'fitbit-rate-limit-limit': '100',
			'fitbit-rate-limit-remaining': '50',
			'fitbit-rate-limit-reset': '60'
		});

		limiter.updateFromHeaders(headers);

		// @ts-expect-error accessing private property
		expect(limiter.limit).toBe(100);
		// @ts-expect-error accessing private property
		expect(limiter.remaining).toBe(50);

        const now = Math.floor(Date.now() / 1000);
		// @ts-expect-error accessing private property
		expect(limiter.reset).toBe(now + 60);
	});
});
