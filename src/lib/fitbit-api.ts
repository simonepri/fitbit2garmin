import { PUBLIC_FITBIT_CLIENT_ID, PUBLIC_FITBIT_REDIRECT_URI } from '$env/static/public';
import { browser } from '$app/environment';

// Helper functions for PKCE flow, adapted from the Python reference
async function sha256(plain: string): Promise<ArrayBuffer> {
	const encoder = new TextEncoder();
	const data = encoder.encode(plain);
	return window.crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(a: ArrayBuffer): string {
	return btoa(String.fromCharCode.apply(null, new Uint8Array(a)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function generateRandomBytes(byteLength: number): Uint8Array {
	const randomBytes = new Uint8Array(byteLength);
	if (browser) {
		window.crypto.getRandomValues(randomBytes);
	}
	return randomBytes;
}

export function getOauth2AuthorizationCodeVerifier(randomBytes = generateRandomBytes(64)): string {
	return base64urlencode(randomBytes.buffer);
}

export async function getOauth2AuthorizationCodeChallenge(codeVerifier: string): Promise<string> {
	const hashed = await sha256(codeVerifier);
	return base64urlencode(hashed);
}

import { writable, get, type Writable } from 'svelte/store';

const FITBIT_OAUTH2_BASE_URL = 'https://www.fitbit.com/oauth2';
const API_BASE_URL = '/api/fitbit-proxy'; // Use our proxy

interface FitbitAuthData {
	access_token: string;
	expires_in: number;
	refresh_token: string;
	scope: string;
	token_type: string;
	user_id: string;
	ts: number; // Timestamp of when the token was received
}

interface FitbitRateLimit {
	limit: number;
	remaining: number;
	reset: number; // Timestamp of when the limit resets
}

// Main API Class
export class FitbitAPI {
	// Auth state
	accessToken: string | null = null;
	refreshToken: string | null = null;
	userId: Writable<string | null> = writable(null);
	scope: string | null = null;
	tokenType: string | null = null;
	expiresAt: number | null = null; // Timestamp in ms

	// Rate limit state
	rateLimit: Writable<FitbitRateLimit> = writable({
		limit: 150,
		remaining: 150,
		reset: Date.now() + 3600 * 1000
	});

	// Reactive logged-in status
	isLoggedIn: Writable<boolean> = writable(false);

	private static readonly STORAGE_KEY_PREFIX = 'fitbit_auth_';

	constructor(data?: Partial<FitbitAPI>) {
		if (data) {
			Object.assign(this, data);
		}
		this.isLoggedIn.set(this.hasValidToken());
	}

	private hasValidToken(): boolean {
		return !!this.accessToken && !!this.expiresAt && this.expiresAt > Date.now();
	}

	// --- Serialization and Persistence ---

	toJSON() {
		return {
			accessToken: this.accessToken,
			refreshToken: this.refreshToken,
			userId: get(this.userId),
			scope: this.scope,
			tokenType: this.tokenType,
			expiresAt: this.expiresAt
		};
	}

	static fromJSON(obj: any): FitbitAPI {
		const api = new FitbitAPI();
		api.accessToken = obj.accessToken;
		api.refreshToken = obj.refreshToken;
		api.userId.set(obj.userId);
		api.scope = obj.scope;
		api.tokenType = obj.tokenType;
		api.expiresAt = obj.expiresAt;
		api.isLoggedIn.set(api.hasValidToken());
		return api;
	}

	saveToLocalStorage() {
		const userId = get(this.userId);
		if (browser && userId) {
			localStorage.setItem(FitbitAPI.STORAGE_KEY_PREFIX + userId, JSON.stringify(this.toJSON()));
		}
	}

	static loadFromLocalStorage(userId: string): FitbitAPI | null {
		if (!browser) return null;
		const data = localStorage.getItem(FitbitAPI.STORAGE_KEY_PREFIX + userId);
		if (data) {
			try {
				return FitbitAPI.fromJSON(JSON.parse(data));
			} catch (e) {
				console.error('Failed to parse Fitbit auth data from localStorage', e);
				return null;
			}
		}
		return null;
	}

	// --- PKCE Auth Flow ---

	async getAuthorizationUrl(): Promise<{ url: string; codeVerifier: string }> {
		const codeVerifier = getOauth2AuthorizationCodeVerifier();
		const codeChallenge = await getOauth2AuthorizationCodeChallenge(codeVerifier);

		const params = new URLSearchParams({
			client_id: PUBLIC_FITBIT_CLIENT_ID,
			redirect_uri: new URL(PUBLIC_FITBIT_REDIRECT_URI, window.location.origin).toString(),
			scope: 'weight activity',
			code_challenge: codeChallenge,
			code_challenge_method: 'S256',
			response_type: 'code'
		});

		return {
			url: `${FITBIT_OAUTH2_BASE_URL}/authorize?${params.toString()}`,
			codeVerifier
		};
	}

	async handleAuthCallback(code: string, codeVerifier: string): Promise<void> {
		const redirectUri = new URL(PUBLIC_FITBIT_REDIRECT_URI, window.location.origin).toString();

		const params = new URLSearchParams({
			client_id: PUBLIC_FITBIT_CLIENT_ID,
			grant_type: 'authorization_code',
			redirect_uri: redirectUri,
			code: code,
			code_verifier: codeVerifier
		});

		// This request goes directly to Fitbit, not our proxy
		const response = await fetch(`${FITBIT_OAUTH2_BASE_URL}/token`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: params.toString()
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to exchange auth code for token: ${response.status} ${errorText}`);
		}

		const data: FitbitAuthData = await response.json();
		this.updateAuthData(data);
		this.saveToLocalStorage();
	}

	private updateAuthData(data: FitbitAuthData) {
		this.accessToken = data.access_token;
		this.refreshToken = data.refresh_token;
		this.userId.set(data.user_id);
		this.scope = data.scope;
		this.tokenType = data.token_type;
		this.expiresAt = Date.now() + data.expires_in * 1000;
		this.isLoggedIn.set(this.hasValidToken());
	}

	private async refreshTokenFlow(): Promise<void> {
		if (!this.refreshToken) {
			throw new Error('No refresh token available. Please log in again.');
		}

		const params = new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: this.refreshToken,
			client_id: PUBLIC_FITBIT_CLIENT_ID
		});

		// This request also goes directly to Fitbit
		const response = await fetch(`${FITBIT_OAUTH2_BASE_URL}/token`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: params.toString()
		});

		if (!response.ok) {
			// If refresh fails, clear auth data and force re-login
			this.logout();
			const errorText = await response.text();
			throw new Error(`Failed to refresh token: ${response.status} ${errorText}`);
		}

		const data: FitbitAuthData = await response.json();
		this.updateAuthData(data);
		this.saveToLocalStorage();
	}

	logout() {
		const userId = get(this.userId);
		if (browser && userId) {
			localStorage.removeItem(FitbitAPI.STORAGE_KEY_PREFIX + userId);
		}
		this.accessToken = null;
		this.refreshToken = null;
		this.userId.set(null);
		this.scope = null;
		this.tokenType = null;
		this.expiresAt = null;
		this.isLoggedIn.set(false);
	}

	protected async apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
		if (!this.hasValidToken()) {
			await this.refreshTokenFlow();
		}

		// --- Rate Limit Throttling ---
		await this.respectRateLimit();

		const headers = new Headers(options.headers);
		headers.set('Authorization', `${this.tokenType} ${this.accessToken}`);

		const response = await fetch(`${API_BASE_URL}${url}`, {
			...options,
			headers
		});

		this.updateRateLimitFromHeaders(response.headers);

		if (response.status === 401) {
			// Token might have been revoked server-side
			console.warn('Received 401 Unauthorized. Forcing token refresh.');
			await this.refreshTokenFlow();

			// Retry the request once after refresh, ensuring we still respect rate limits
			headers.set('Authorization', `${this.tokenType} ${this.accessToken}`);
			await this.respectRateLimit();

			const retryResponse = await fetch(`${API_BASE_URL}${url}`, { ...options, headers });
			this.updateRateLimitFromHeaders(retryResponse.headers);
			return retryResponse;
		}

		return response;
	}

	private rateLimitingEnabled = true;

	disableRateLimiting() {
		this.rateLimitingEnabled = false;
	}

	private async respectRateLimit(): Promise<void> {
		if (!this.rateLimitingEnabled) return;

		const currentRateLimit = get(this.rateLimit);
		const timeToReset = Math.max(0, currentRateLimit.reset - Date.now());

		// Using remaining <= 1 is a defensive choice to avoid race conditions
		// on the very last available API call.
		if (currentRateLimit.remaining <= 1) {
			const waitTime = timeToReset + 1000; // Wait until reset + 1s buffer
			if (waitTime > 0) {
				console.warn(`Fitbit API rate limit reached. Waiting for ${waitTime}ms.`);
				await new Promise((resolve) => setTimeout(resolve, waitTime));
			}
		} else if (timeToReset > 0) {
			// If not at the limit, pace the requests to spread them out over
			// the remaining time in the window.
			const sleepTime = timeToReset / currentRateLimit.remaining;
			if (sleepTime > 0) {
				await new Promise((resolve) => setTimeout(resolve, sleepTime));
			}
		}
	}

	private updateRateLimitFromHeaders(headers: Headers) {
		const newLimit = parseInt(headers.get('fitbit-rate-limit-limit') || '150', 10);
		const newRemaining = parseInt(headers.get('fitbit-rate-limit-remaining') || '150', 10);
		const newResetSeconds = parseInt(headers.get('fitbit-rate-limit-reset') || '3600', 10);

		this.rateLimit.set({
			limit: newLimit,
			remaining: newRemaining,
			reset: Date.now() + newResetSeconds * 1000
		});
	}

	async get(url: string, options: RequestInit = {}): Promise<Response> {
		return this.apiFetch(url, { ...options, method: 'GET' });
	}

	async post(url: string, body: any, options: RequestInit = {}): Promise<Response> {
		return this.apiFetch(url, {
			...options,
			method: 'POST',
			body: JSON.stringify(body),
			headers: { 'Content-Type': 'application/json', ...options.headers }
		});
	}
}