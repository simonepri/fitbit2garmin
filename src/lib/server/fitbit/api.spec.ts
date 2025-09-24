import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as fitbitApi from './api';
import { format } from 'date-fns';

// Mock the global fetch
global.fetch = vi.fn();

describe('Fitbit API Wrapper', () => {
	const clientId = 'test-client-id';
	const baseToken: fitbitApi.FitbitToken = {
		access_token: 'access',
		refresh_token: 'refresh',
		expires_in: 3600,
		ts: Date.now() / 1000,
		scope: 'activity weight',
		token_type: 'Bearer',
		user_id: 'user'
	};

	beforeEach(() => {
		vi.resetAllMocks();
	});

	describe('URL Builders', () => {
		it('should build the correct weight timeseries URL', () => {
			const start = new Date('2023-01-01');
			const end = new Date('2023-01-31');
			const url = fitbitApi.getWeightTimeseriesUrl(start, end);
			expect(url).toContain('/body/log/weight/date/2023-01-01/2023-01-31.json');
		});

		it('should build the correct activity log list URL', () => {
			const start = new Date('2023-03-01');
			const url = fitbitApi.getActivityLogListUrl(start);
			expect(url).toContain('/activities/list.json');
			expect(url).toContain('afterDate=2023-03-01');
		});
	});

	describe('API Calls', () => {
		it('getWeightTimeseries should fetch data', async () => {
			const mockResponse = { weight: [{ logId: 1, weight: 80 }] };
			(fetch as vi.Mock).mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockResponse),
                headers: new Headers({ 'Content-Type': 'application/json' }),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
			});

			const result = await fitbitApi.getWeightTimeseries(
				baseToken,
				clientId,
				vi.fn(),
				new Date(),
				new Date()
			);
			expect(fetch).toHaveBeenCalledOnce();
			expect(result).toEqual(mockResponse);
		});

		it('should refresh token if expired', async () => {
			const expiredToken = { ...baseToken, expires_in: -100 };
			const refreshedToken = { ...baseToken, access_token: 'new-access-token' };

			// First call for refresh, second for the actual data
			(fetch as vi.Mock)
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(refreshedToken),
					headers: new Headers(),
                    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ weight: [] }),
                    headers: new Headers({ 'Content-Type': 'application/json' }),
                    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
				});

			const onTokenRefresh = vi.fn();

			await fitbitApi.getWeightTimeseries(
				expiredToken,
				clientId,
				onTokenRefresh,
				new Date(),
				new Date()
			);

			// Check that refresh was called
			const firstFetchCall = (fetch as vi.Mock).mock.calls[0];
			expect(firstFetchCall[0]).toContain('/oauth2/token');
			const body = new URLSearchParams(firstFetchCall[1].body);
			expect(body.get('grant_type')).toBe('refresh_token');

			// Check that the original API was called with the new token
			const secondFetchCall = (fetch as vi.Mock).mock.calls[1];
			const authHeader = new Headers(secondFetchCall[1].headers).get('Authorization');
			expect(authHeader).toBe('Bearer new-access-token');

            // Check that the onTokenRefresh callback was called
            expect(onTokenRefresh).toHaveBeenCalledWith(expect.objectContaining({
                access_token: 'new-access-token'
            }));
		});
	});
});
