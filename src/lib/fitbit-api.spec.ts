import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FitbitAPI } from './fitbit-api';
import { get } from 'svelte/store';
import { webcrypto } from 'node:crypto';

// Mock environment variables
vi.mock('$env/static/public', () => ({
	PUBLIC_FITBIT_CLIENT_ID: 'test-client-id',
	PUBLIC_FITBIT_REDIRECT_URI: 'http://localhost:5173/fitbit-auth',
	PUBLIC_FITBIT_PROXY_ADDRESS: 'http://localhost:5173/api/fitbit-proxy'
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto
vi.stubGlobal('crypto', {
	...webcrypto,
	subtle: webcrypto.subtle,
	getRandomValues: (arr: ArrayBufferView) => arr
});

describe('FitbitAPI', () => {
	let fitbitApi: FitbitAPI;

	beforeEach(() => {
		fitbitApi = new FitbitAPI('test-client-id', 'http://localhost:5173/fitbit-auth');
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('should initialize with default values', () => {
		const state = get(fitbitApi.state);
		expect(state.accessToken).toBeNull();
		expect(state.refreshToken).toBeNull();
		expect(state.userId).toBeNull();
		expect(get(fitbitApi.isAuthenticated)).toBe(false);
	});

	it('should generate authorization url', async () => {
		const { url, codeVerifier } = await fitbitApi.getAuthorizationUrl('test-scope', 'test-state');
		expect(url).toContain('https://www.fitbit.com/oauth2/authorize');
		expect(url).toContain('client_id=test-client-id');
		expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Ffitbit-auth');
		expect(url).toContain('scope=test-scope');
		expect(url).toContain('state=test-state');
		expect(url).toContain('code_challenge_method=S256');
		expect(codeVerifier).toBeDefined();
	});

	it('should handle oauth callback', async () => {
		const mockResponse = {
			access_token: 'test-access-token',
			refresh_token: 'test-refresh-token',
			user_id: 'test-user-id',
			scope: 'test-scope',
			token_type: 'Bearer',
			expires_in: 3600
		};
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(mockResponse)));

		await fitbitApi.handleOAuthCallback('test-code', 'test-code-verifier', 'test-state');

		const state = get(fitbitApi.state);
		expect(state.accessToken).toBe('test-access-token');
		expect(state.refreshToken).toBe('test-refresh-token');
		expect(state.userId).toBe('test-user-id');
		expect(get(fitbitApi.isAuthenticated)).toBe(true);
	});

	it('should make an api call', async () => {
		fitbitApi.state.set({
			...get(fitbitApi.state),
			accessToken: 'test-access-token',
			expiresAt: Date.now() + 3600 * 1000
		});

		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: 'test' })));
		const response = await fitbitApi.apiCall('/1/test-url');
		const data = await response.json();

		expect(mockFetch).toHaveBeenCalledWith('http://localhost:5173/api/fitbit-proxy/1/test-url', {
			headers: {
				Authorization: 'Bearer test-access-token'
			}
		});
		expect(data).toEqual({ data: 'test' });
	});

	it('should refresh token if expired', async () => {
		fitbitApi.state.set({
			...get(fitbitApi.state),
			accessToken: 'test-access-token',
			refreshToken: 'test-refresh-token',
			expiresAt: Date.now() - 1000
		});

		const mockRefreshResponse = {
			access_token: 'new-access-token',
			refresh_token: 'new-refresh-token',
			expires_in: 3600
		};
		const mockApiResponse = { data: 'test' };

		mockFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(mockRefreshResponse)))
			.mockResolvedValueOnce(new Response(JSON.stringify(mockApiResponse)));

		await fitbitApi.apiCall('/1/test-url');

		const state = get(fitbitApi.state);
		expect(state.accessToken).toBe('new-access-token');
		expect(state.refreshToken).toBe('new-refresh-token');
	});

	it('should handle rate limiting', async () => {
		fitbitApi.state.set({
			...get(fitbitApi.state),
			accessToken: 'test-access-token',
			expiresAt: Date.now() + 3600 * 1000,
			rateLimitRemaining: 0,
			rateLimitReset: Date.now() + 1000
		});

		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: 'test' })));

		const now = Date.now();
		const apiCallPromise = fitbitApi.apiCall('/1/test-url');
		vi.advanceTimersByTime(1000);
		await apiCallPromise;

		expect(Date.now() - now).toBeGreaterThanOrEqual(1000);
		expect(mockFetch).toHaveBeenCalledWith('http://localhost:5173/api/fitbit-proxy/1/test-url', {
			headers: {
				Authorization: 'Bearer test-access-token'
			}
		});
	});

	it('should logout', () => {
		fitbitApi.state.set({
			...get(fitbitApi.state),
			accessToken: 'test-access-token'
		});
		expect(get(fitbitApi.isAuthenticated)).toBe(true);

		fitbitApi.logout();

		expect(get(fitbitApi.isAuthenticated)).toBe(false);
		const state = get(fitbitApi.state);
		expect(state.accessToken).toBeNull();
	});

	it('should serialize and deserialize state', () => {
		const state = {
			accessToken: 'test-access-token',
			refreshToken: 'test-refresh-token',
			userId: 'test-user-id',
			scope: 'test-scope',
			tokenType: 'Bearer',
			expiresAt: 123456789,
			rateLimitLimit: 150,
			rateLimitRemaining: 100,
			rateLimitReset: 987654321
		};

		const jsonState = JSON.stringify(state);
		fitbitApi.fromJSON(jsonState);

		expect(get(fitbitApi.state)).toEqual(state);
		expect(fitbitApi.toJSON()).toEqual(jsonState);
	});
});
