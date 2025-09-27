import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FitbitAPI, type FitbitToken } from './fitbit-api';
import { writable } from 'svelte/store';

// Mock SvelteKit's $env module
vi.mock('$env/static/public', () => ({
	PUBLIC_FITBIT_CLIENT_ID: 'test-client-id',
	PUBLIC_FITBIT_REDIRECT_URI: 'http://localhost:5173/fitbit-auth',
	PUBLIC_FITBIT_PROXY_ADDRESS: ''
}));

// Mock SvelteKit's $app/environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock Svelte's store
vi.mock('svelte/store', () => ({
	writable: vi.fn((initialValue) => {
		let value = initialValue;
		return {
			set: vi.fn((newValue) => {
				value = newValue;
			}),
			subscribe: vi.fn((run) => {
				run(value);
				return () => {};
			}),
			update: vi.fn((updater) => {
				value = updater(value);
			})
		};
	})
}));

// Mock storage
class MockStorage {
	private store: Record<string, string> = {};
	getItem(key: string) {
		return this.store[key] || null;
	}
	setItem(key: string, value: string) {
		this.store[key] = value;
	}
	removeItem(key: string) {
		delete this.store[key];
	}
	clear() {
		this.store = {};
	}
}

// Mock crypto for PKCE
const mockCrypto = {
	getRandomValues: vi.fn((arr: Uint8Array) => {
		for (let i = 0; i < arr.length; i++) {
			arr[i] = i;
		}
		return arr;
	}),
	subtle: {
		digest: vi.fn(() => {
			return Promise.resolve(new ArrayBuffer(32));
		})
	}
};
Object.defineProperty(global, 'crypto', {
	value: mockCrypto
});

global.fetch = vi.fn();

describe('FitbitAPI', () => {
	let mockStorage: MockStorage;

	beforeEach(() => {
		mockStorage = new MockStorage();
		vi.clearAllMocks();
		(writable as vi.Mock).mockClear();
	});

	it('should initialize with default state when no stored state exists', () => {
		const api = new FitbitAPI('test-key', mockStorage);
		expect(api.toJSON().token).toBeNull();
		expect(api.toJSON().rateLimit.limit).toBe(150);
		expect(writable).toHaveBeenCalledWith(false);
	});

	it('should load state from storage on initialization', () => {
		const token: FitbitToken = {
			access_token: 'access',
			expires_in: 3600,
			refresh_token: 'refresh',
			scope: 'all',
			token_type: 'Bearer',
			user_id: 'test-user',
			ts: Date.now()
		};
		const state = {
			token,
			rateLimit: { limit: 100, remaining: 50, reset: 1800, resetDate: Date.now() + 1800 * 1000 },
			codeVerifier: null
		};
		mockStorage.setItem('test-key', JSON.stringify(state));

		const api = new FitbitAPI('test-key', mockStorage);
		expect(api.toJSON().token).toEqual(token);
		expect(api.toJSON().rateLimit.limit).toBe(100);
		expect(writable).toHaveBeenCalledWith(true);
	});

	it('should generate a valid authorization URL', async () => {
		const api = new FitbitAPI('test-key', mockStorage);
		const url = await api.getAuthorizationUrl();

		expect(url).toContain('https://www.fitbit.com/oauth2/authorize');
		expect(url).toContain('client_id=test-client-id');
		expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Ffitbit-auth');
		expect(url).toContain('response_type=code');
		expect(url).toContain('code_challenge_method=S256');
		expect(api.toJSON().codeVerifier).not.toBeNull();
	});

	it('should handle auth callback and fetch a token', async () => {
		const api = new FitbitAPI('test-key', mockStorage);
		await api.getAuthorizationUrl(); // to set codeVerifier

		const mockToken: Omit<FitbitToken, 'ts'> = {
			access_token: 'new_access_token',
			expires_in: 3600,
			refresh_token: 'new_refresh_token',
			scope: 'weight activity',
			token_type: 'Bearer',
			user_id: 'user123'
		};

		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockToken)
		} as Response);

		await api.handleAuthCallback('test_code');

		expect(fetch).toHaveBeenCalledWith(
			'/api/fitbit-proxy/https://api.fitbit.com/oauth2/token',
			expect.any(Object)
		);
		expect(api.toJSON().token?.access_token).toBe('new_access_token');
		expect(api.toJSON().codeVerifier).toBeNull();
		expect(api.isLoggedIn.set).toHaveBeenCalledWith(true);
	});

	it('should refresh token when it is expired', async () => {
		const expiredToken: FitbitToken = {
			access_token: 'expired_access_token',
			expires_in: -3600,
			refresh_token: 'expired_refresh_token',
			scope: 'all',
			token_type: 'Bearer',
			user_id: 'test-user',
			ts: Date.now() - 7200 * 1000 // 2 hours ago
		};
		const state = {
			token: expiredToken,
			rateLimit: { limit: 150, remaining: 150, reset: 3600, resetDate: 0 },
			codeVerifier: null
		};
		mockStorage.setItem('test-key', JSON.stringify(state));

		const api = new FitbitAPI('test-key', mockStorage);

		const refreshedToken: Omit<FitbitToken, 'ts'> = {
			access_token: 'refreshed_access_token',
			expires_in: 3600,
			refresh_token: 'refreshed_refresh_token',
			scope: 'all',
			token_type: 'Bearer',
			user_id: 'test-user'
		};

		vi.mocked(fetch)
			.mockResolvedValueOnce({
				// For the refresh token call
				ok: true,
				json: () => Promise.resolve(refreshedToken)
			} as Response)
			.mockResolvedValueOnce({
				// For the actual API call
				ok: true,
				headers: new Headers(),
				json: () => Promise.resolve({ data: 'some data' })
			} as Response);

		await api.apiFetch('/user/-/profile.json');

		expect(fetch).toHaveBeenCalledWith(
			'/api/fitbit-proxy/https://api.fitbit.com/oauth2/token',
			expect.any(Object)
		);
		expect(api.toJSON().token?.access_token).toBe('refreshed_access_token');
	});

	it('should logout and clear state', () => {
		const token: FitbitToken = {
			access_token: 'access',
			expires_in: 3600,
			refresh_token: 'refresh',
			scope: 'all',
			token_type: 'Bearer',
			user_id: 'test-user',
			ts: Date.now()
		};
		const state = {
			token,
			rateLimit: { limit: 100, remaining: 50, reset: 1800, resetDate: 0 },
			codeVerifier: '123'
		};
		mockStorage.setItem('test-key', JSON.stringify(state));

		const api = new FitbitAPI('test-key', mockStorage);
		api.logout();

		expect(api.toJSON().token).toBeNull();
		expect(api.toJSON().codeVerifier).toBeNull();
		expect(api.isLoggedIn.set).toHaveBeenCalledWith(false);
		expect(mockStorage.getItem('test-key')).toContain('"token":null');
	});
});
