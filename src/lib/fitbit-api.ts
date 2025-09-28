import { PUBLIC_FITBIT_CLIENT_ID, PUBLIC_FITBIT_REDIRECT_URI } from '$env/static/public';
import { browser } from '$app/environment';
import { writable, type Writable } from 'svelte/store';

const API_BASE_URL = 'https://api.fitbit.com';
const API_OAUTH2_BASE_URL = 'https://www.fitbit.com/oauth2';

interface FitbitAuthState {
	accessToken?: string;
	refreshToken?: string;
	userId?: string;
	expiresAt?: number;
	codeVerifier?: string;
	rateLimit?: {
		limit: number;
		remaining: number;
		reset: number;
	};
}

export class FitbitApi {
	private state: Writable<FitbitAuthState>;

	constructor(initialState: FitbitAuthState = {}) {
		this.state = writable(initialState);
		if (browser) {
			const storedState = localStorage.getItem('fitbit-auth');
			if (storedState) {
				this.state.set(JSON.parse(storedState));
			}
			this.state.subscribe((value) => {
				localStorage.setItem('fitbit-auth', JSON.stringify(value));
			});
		}
	}

	public get authState() {
		return this.state;
	}

	private async generateCodeVerifier(): Promise<string> {
		const randomBytes = new Uint8Array(64);
		crypto.getRandomValues(randomBytes);
		return this.base64UrlEncode(randomBytes);
	}

	private async generateCodeChallenge(verifier: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(verifier);
		const digest = await crypto.subtle.digest('SHA-256', data);
		return this.base64UrlEncode(new Uint8Array(digest));
	}

	private base64UrlEncode(bytes: Uint8Array): string {
		return btoa(String.fromCharCode(...bytes))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
	}

	public async getLoginUrl(): Promise<string> {
		if (!browser) return '';

		const codeVerifier = await this.generateCodeVerifier();
		const codeChallenge = await this.generateCodeChallenge(codeVerifier);
		this.state.update((s) => ({ ...s, codeVerifier }));

		const redirectUri = PUBLIC_FITBIT_REDIRECT_URI || `${window.location.origin}/fitbit-auth`;
		const params = new URLSearchParams({
			client_id: PUBLIC_FITBIT_CLIENT_ID,
			redirect_uri: redirectUri,
			scope: 'weight activity',
			code_challenge: codeChallenge,
			code_challenge_method: 'S256',
			response_type: 'code'
		});

		return `${API_OAUTH2_BASE_URL}/authorize?${params.toString()}`;
	}

	public async exchangeCodeForToken(code: string): Promise<void> {
		if (!browser) return;

		let codeVerifier = '';
		this.state.subscribe((s) => (codeVerifier = s.codeVerifier || ''))();

		const redirectUri = PUBLIC_FITBIT_REDIRECT_URI || `${window.location.origin}/fitbit-auth`;
		const body = new URLSearchParams({
			client_id: PUBLIC_FITBIT_CLIENT_ID,
			grant_type: 'authorization_code',
			redirect_uri: redirectUri,
			code: code,
			code_verifier: codeVerifier
		});

		const response = await fetch(`${API_BASE_URL}/oauth2/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body
		});

		if (!response.ok) {
			throw new Error('Failed to exchange code for token');
		}

		const data = await response.json();
		this.state.set({
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			userId: data.user_id,
			expiresAt: Date.now() + data.expires_in * 1000,
			rateLimit: { limit: 150, remaining: 150, reset: 3600 }
		});
	}

	private async refreshToken(): Promise<void> {
		let currentRefreshToken = '';
		this.state.subscribe((s) => (currentRefreshToken = s.refreshToken || ''))();

		const body = new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: currentRefreshToken,
			client_id: PUBLIC_FITBIT_CLIENT_ID
		});

		const response = await fetch(`${API_BASE_URL}/oauth2/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body
		});

		if (!response.ok) {
			this.logout();
			throw new Error('Failed to refresh token');
		}

		const data = await response.json();
		this.state.update((s) => ({
			...s,
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresAt: Date.now() + data.expires_in * 1000
		}));
	}

	public async apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
		let auth: FitbitAuthState = {};
		this.state.subscribe((s) => (auth = s))();

		if (!auth.accessToken) {
			throw new Error('Not authenticated');
		}

		if (auth.expiresAt && Date.now() > auth.expiresAt) {
			await this.refreshToken();
			this.state.subscribe((s) => (auth = s))();
		}

		const headers = new Headers(options.headers);
		headers.set('Authorization', `Bearer ${auth.accessToken}`);

		const response = await fetch(`/api/fitbit-proxy/${path}`, { ...options, headers });

		const limit = response.headers.get('fitbit-rate-limit-limit');
		const remaining = response.headers.get('fitbit-rate-limit-remaining');
		const reset = response.headers.get('fitbit-rate-limit-reset');

		this.state.update((s) => ({
			...s,
			rateLimit: {
				limit: limit ? parseInt(limit, 10) : s.rateLimit?.limit || 150,
				remaining: remaining ? parseInt(remaining, 10) : s.rateLimit?.remaining || 150,
				reset: reset ? parseInt(reset, 10) : s.rateLimit?.reset || 3600
			}
		}));

		if (auth.rateLimit?.remaining === 0) {
			const resetInSeconds = auth.rateLimit.reset;
			await new Promise((resolve) => setTimeout(resolve, resetInSeconds * 1000));
		}

		return response;
	}

	public logout() {
		this.state.set({});
	}
}
