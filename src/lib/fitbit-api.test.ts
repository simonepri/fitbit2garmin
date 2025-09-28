import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// Mock browser environment first
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock localStorage *before* importing the module that uses it.
let store: Record<string, string> = {};
const mockLocalStorage = {
	getItem: (key: string) => store[key] || null,
	setItem: (key: string, value: string) => {
		store[key] = value;
	},
	removeItem: (key: string) => {
		delete store[key];
	},
	clear: () => {
		store = {};
	}
};
vi.stubGlobal('localStorage', mockLocalStorage);

import { FitbitApi } from './fitbit-api';

// Mock env variables
vi.mock('$env/static/public', () => ({
	PUBLIC_FITBIT_CLIENT_ID: 'TEST_CLIENT_ID',
	PUBLIC_FITBIT_REDIRECT_URI: 'http://localhost:5173/fitbit-auth'
}));

// Mock crypto for PKCE
const mockCrypto = {
	getRandomValues: vi.fn((array: Uint8Array) => {
		for (let i = 0; i < array.length; i++) {
			array[i] = i;
		}
		return array;
	}),
	subtle: {
		digest: vi.fn(async () => {
			return new Uint8Array([1, 2, 3, 4, 5]).buffer;
		})
	}
};
vi.stubGlobal('crypto', mockCrypto);

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('FitbitApi', () => {
	let fitbitApi: FitbitApi;

	beforeEach(() => {
		// We test the class, not the singleton instance
		fitbitApi = new FitbitApi();
		mockLocalStorage.clear();
		mockFetch.mockReset();
	});

	it('should initialize with default state', () => {
		const state = get(fitbitApi.authState);
		expect(state).toEqual({});
	});

	it('should load state from localStorage on initialization', () => {
		const initialState = { accessToken: 'test-token' };
		localStorage.setItem('fitbit-auth', JSON.stringify(initialState));
		const newApi = new FitbitApi();
		const state = get(newApi.authState);
		expect(state).toEqual(initialState);
	});

	it('should generate a valid login URL', async () => {
		const url = await fitbitApi.getLoginUrl();
		expect(url).toContain('https://www.fitbit.com/oauth2/authorize');
		expect(url).toContain('client_id=TEST_CLIENT_ID');
		expect(url).toContain('response_type=code');
		expect(url).toContain('code_challenge_method=S256');
		const state = get(fitbitApi.authState);
		expect(state.codeVerifier).toBeDefined();
	});

	it('should exchange code for token', async () => {
		mockFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					access_token: 'new-access-token',
					refresh_token: 'new-refresh-token',
					user_id: 'test-user',
					expires_in: 3600
				}),
				{ status: 200 }
			)
		);

		await fitbitApi.exchangeCodeForToken('test-code');

		const state = get(fitbitApi.authState);
		expect(state.accessToken).toBe('new-access-token');
		expect(state.refreshToken).toBe('new-refresh-token');
		expect(state.userId).toBe('test-user');
		expect(state.expiresAt).toBeDefined();
	});

	it('should refresh token when expired', async () => {
		const initial_state = {
			accessToken: 'expired-token',
			refreshToken: 'test-refresh-token',
			expiresAt: Date.now() - 1000
		};
		fitbitApi = new FitbitApi(initial_state);

		mockFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					access_token: 'refreshed-access-token',
					refresh_token: 'new-refresh-token',
					expires_in: 3600
				}),
				{ status: 200 }
			)
		);

		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ some: 'data' }), {
				status: 200,
				headers: {
					'fitbit-rate-limit-limit': '150',
					'fitbit-rate-limit-remaining': '149',
					'fitbit-rate-limit-reset': '3000'
				}
			})
		);

		await fitbitApi.apiFetch('some/path');

		const state = get(fitbitApi.authState);
		expect(state.accessToken).toBe('refreshed-access-token');
		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining('oauth2/token'),
			expect.any(Object)
		);
	});

	it('should handle API fetch with valid token', async () => {
		fitbitApi = new FitbitApi({ accessToken: 'valid-token', expiresAt: Date.now() + 10000 });

		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ data: 'test' }), {
				status: 200,
				headers: {
					'fitbit-rate-limit-limit': '150',
					'fitbit-rate-limit-remaining': '148',
					'fitbit-rate-limit-reset': '2900'
				}
			})
		);

		const response = await fitbitApi.apiFetch('test/path');
		const data = await response.json();

		expect(data).toEqual({ data: 'test' });
		expect(mockFetch).toHaveBeenCalledWith(
			'/api/fitbit-proxy/test/path',
			expect.objectContaining({
				headers: expect.any(Headers)
			})
		);
		const state = get(fitbitApi.authState);
		expect(state.rateLimit?.remaining).toBe(148);
	});

	it('should logout and clear state', () => {
		fitbitApi = new FitbitApi({ accessToken: 'some-token' });
		fitbitApi.logout();
		const state = get(fitbitApi.authState);
		expect(state).toEqual({});
		expect(localStorage.getItem('fitbit-auth')).toBe('{}');
	});
});
