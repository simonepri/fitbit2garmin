import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get, writable } from 'svelte/store';
import {
	fitbitAuth,
	fitbitPkce,
	getOAuth2AuthorizationUrl,
	getOAuth2Token,
	refreshToken,
	apiFetch,
	logout
} from './fitbit-api';
import type { Mock } from 'vitest';

// Mock Svelte's persisted store
vi.mock('svelte-local-storage-store', () => {
	return {
		persisted: (key: string, initial: unknown) => writable(initial)
	};
});

// Mock environment variables
vi.mock('$env/static/public', () => ({
	PUBLIC_FITBIT_CLIENT_ID: 'TEST_CLIENT_ID',
	PUBLIC_FITBIT_REDIRECT_URI: 'http://localhost:5173/fitbit-auth'
}));

global.fetch = vi.fn();
global.crypto.randomUUID = vi.fn(() => 'mock-uuid');

describe('fitbit-api', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		logout(); // Reset stores
	});

	describe('getOAuth2AuthorizationUrl', () => {
		it('should generate the correct authorization URL and set PKCE values', async () => {
			const url = await getOAuth2AuthorizationUrl();
			const pkce = get(fitbitPkce);

			expect(pkce.codeVerifier).toBe('mock-uuid');
			expect(pkce.state).toBe('mock-uuid');
			expect(url).toContain('https://www.fitbit.com/oauth2/authorize');
			expect(url).toContain('client_id=TEST_CLIENT_ID');
			expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Ffitbit-auth');
			expect(url).toContain('scope=weight+activity+profile');
			expect(url).toContain('response_type=code');
			expect(url).toContain('state=mock-uuid');
			expect(url).toContain('code_challenge_method=S256');
		});
	});

	describe('getOAuth2Token', () => {
		it('should fetch and set the token on valid state', async () => {
			fitbitPkce.set({ codeVerifier: 'mock-verifier', state: 'mock-state' });
			const mockAuthResponse = {
				access_token: 'mock-access-token',
				expires_in: 3600,
				refresh_token: 'mock-refresh-token',
				scope: 'weight activity profile',
				token_type: 'Bearer',
				user_id: 'mock-user-id'
			};
			(fetch as Mock).mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockAuthResponse)
			});

			await getOAuth2Token('mock-code', 'mock-state');

			const auth = get(fitbitAuth);
			expect(auth.access_token).toBe('mock-access-token');
			expect(auth.user_id).toBe('mock-user-id');
			expect(get(fitbitPkce).codeVerifier).toBe('');
		});

		it('should throw an error on invalid state', async () => {
			fitbitPkce.set({ codeVerifier: 'mock-verifier', state: 'different-state' });
			await expect(getOAuth2Token('mock-code', 'mock-state')).rejects.toThrow('Invalid state');
		});
	});

	describe('refreshToken', () => {
		it('should refresh and set the new token', async () => {
			fitbitAuth.set({
				access_token: 'old-access-token',
				expires_in: 3600,
				refresh_token: 'old-refresh-token',
				scope: 'weight activity profile',
				token_type: 'Bearer',
				user_id: 'mock-user-id',
				ts: Date.now() - 4000 * 1000
			});
			const mockRefreshResponse = {
				access_token: 'new-access-token',
				expires_in: 3600,
				refresh_token: 'new-refresh-token'
			};
			(fetch as Mock).mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockRefreshResponse)
			});

			await refreshToken();

			const auth = get(fitbitAuth);
			expect(auth.access_token).toBe('new-access-token');
			expect(auth.refresh_token).toBe('new-refresh-token');
		});
	});

	describe('apiFetch', () => {
		it('should perform an authenticated fetch request', async () => {
			fitbitAuth.set({
				access_token: 'valid-token',
				expires_in: 3600,
				refresh_token: 'valid-refresh-token',
				scope: 'weight activity profile',
				token_type: 'Bearer',
				user_id: 'mock-user-id',
				ts: Date.now()
			});
			(fetch as Mock).mockResolvedValue({
				ok: true,
				headers: new Headers({
					'fitbit-rate-limit-limit': '150',
					'fitbit-rate-limit-remaining': '149',
					'fitbit-rate-limit-reset': '3600'
				}),
				json: () => Promise.resolve({ data: 'some-data' })
			});

			const response = await apiFetch('some/path');
			expect(fetch).toHaveBeenCalledWith('/api/fitbit-proxy/some/path', {
				headers: {
					Authorization: 'Bearer valid-token'
				}
			});
			expect(response.ok).toBe(true);
		});

		it('should refresh the token if it has expired', async () => {
			fitbitAuth.set({
				access_token: 'expired-token',
				expires_in: -1, // expired
				refresh_token: 'valid-refresh-token',
				scope: 'weight activity profile',
				token_type: 'Bearer',
				user_id: 'mock-user-id',
				ts: Date.now() - 1000
			});

			const mockRefreshResponse = {
				access_token: 'new-access-token',
				expires_in: 3600,
				refresh_token: 'new-refresh-token'
			};
			(fetch as Mock)
				.mockResolvedValueOnce({
					// for refresh token call
					ok: true,
					json: () => Promise.resolve(mockRefreshResponse)
				})
				.mockResolvedValueOnce({
					// for apiFetch call
					ok: true,
					headers: new Headers(),
					json: () => Promise.resolve({ data: 'some-data' })
				});

			await apiFetch('some/path');

			expect(fetch).toHaveBeenCalledWith(
				expect.stringContaining('oauth2/token'),
				expect.any(Object)
			);
			expect(fetch).toHaveBeenCalledWith('/api/fitbit-proxy/some/path', {
				headers: {
					Authorization: 'Bearer new-access-token'
				}
			});
		});
	});

	describe('logout', () => {
		it('should clear all authentication data', () => {
			fitbitAuth.set({
				access_token: 'some-token',
				expires_in: 3600,
				refresh_token: 'some-refresh-token',
				scope: 'weight activity profile',
				token_type: 'Bearer',
				user_id: 'mock-user-id',
				ts: Date.now()
			});
			fitbitPkce.set({
				codeVerifier: 'some-verifier',
				state: 'some-state'
			});

			logout();

			const auth = get(fitbitAuth);
			const pkce = get(fitbitPkce);

			expect(auth.access_token).toBe('');
			expect(auth.refresh_token).toBe('');
			expect(auth.user_id).toBe('');
			expect(pkce.codeVerifier).toBe('');
			expect(pkce.state).toBe('');
		});
	});
});
