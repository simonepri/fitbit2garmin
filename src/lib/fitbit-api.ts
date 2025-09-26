import { writable } from 'svelte/store';
import type { FitbitState } from './types';
import { PUBLIC_FITBIT_PROXY_ADDRESS } from '$env/static/public';

// Constants
const API_OAUTH2_BASE_URL = 'https://www.fitbit.com/oauth2';

// Helper function to generate a random string
const generateRandomString = (length: number): string => {
	let result = '';
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
	const charactersLength = characters.length;
	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
};

// Helper function to create a SHA256 hash
const sha256 = async (buffer: string): Promise<ArrayBuffer> => {
	return await crypto.subtle.digest('SHA-256', new TextEncoder().encode(buffer));
};

// Helper function to base64url encode
const base64urlencode = (buffer: ArrayBuffer): string => {
	return btoa(String.fromCharCode(...new Uint8Array(buffer)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
};

// Fitbit API class
export class FitbitAPI {
	private clientId: string;
	private redirectUri: string;
	private proxyAddress: string;

	public state = writable<FitbitState>({
		accessToken: null,
		refreshToken: null,
		userId: null,
		scope: null,
		tokenType: null,
		expiresAt: 0,
		rateLimitLimit: 150,
		rateLimitRemaining: 150,
		rateLimitReset: Date.now() + 3600 * 1000
	});

	public isAuthenticated = writable(false);

	constructor(clientId: string, redirectUri: string) {
		this.clientId = clientId;
		this.redirectUri = redirectUri;
		this.proxyAddress = PUBLIC_FITBIT_PROXY_ADDRESS || '';

		this.state.subscribe(({ accessToken }) => {
			this.isAuthenticated.set(!!accessToken);
		});
	}

	public getState(): FitbitState {
		let value: FitbitState;
		// This is a temporary workaround to synchronously get the value of a store
		// outside of a Svelte component. A better long-term solution would be to
		// refactor the class to not depend on synchronous store access.
		const unsubscribe = this.state.subscribe((v) => {
			value = v;
		});
		unsubscribe();
		return value!;
	}

	// Method to generate the authorization URL
	public async getAuthorizationUrl(
		scope: string,
		state: string
	): Promise<{ url: string; codeVerifier: string }> {
		const codeVerifier = generateRandomString(128);
		const codeChallenge = base64urlencode(await sha256(codeVerifier));

		const params = new URLSearchParams({
			client_id: this.clientId,
			redirect_uri: this.redirectUri,
			scope,
			state,
			code_challenge: codeChallenge,
			code_challenge_method: 'S256',
			response_type: 'code'
		});

		return {
			url: `${API_OAUTH2_BASE_URL}/authorize?${params.toString()}`,
			codeVerifier
		};
	}

	// Method to handle the OAuth callback
	public async handleOAuthCallback(
		code: string,
		codeVerifier: string,
		state: string
	): Promise<void> {
		const payload = new URLSearchParams({
			client_id: this.clientId,
			redirect_uri: this.redirectUri,
			state,
			code,
			code_verifier: codeVerifier,
			grant_type: 'authorization_code'
		});

		const res = await fetch(`${this.proxyAddress}/oauth2/token`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: payload.toString()
		});

		if (!res.ok) {
			throw new Error('Failed to exchange authorization code for access token');
		}

		const data = await res.json();
		this.updateState({
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			userId: data.user_id,
			scope: data.scope,
			tokenType: data.token_type,
			expiresAt: Date.now() + data.expires_in * 1000
		});
	}

	// Method to make an API call
	public async apiCall(url: string, options: RequestInit = {}): Promise<Response> {
		let currentState = this.getState();
		if (currentState.rateLimitRemaining === 0 && Date.now() < currentState.rateLimitReset) {
			await new Promise((resolve) => setTimeout(resolve, currentState.rateLimitReset - Date.now()));
		}

		if (currentState.expiresAt < Date.now()) {
			await this.refreshToken();
			currentState = this.getState();
		}

		const res = await fetch(`${this.proxyAddress}${url}`, {
			...options,
			headers: {
				...options.headers,
				Authorization: `Bearer ${currentState.accessToken}`
			}
		});

		this.updateRateLimit(res.headers);
		return res;
	}

	// Method to refresh the access token
	private async refreshToken(): Promise<void> {
		const state = this.getState();

		const payload = new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: state.refreshToken || ''
		});

		const res = await fetch(`${this.proxyAddress}/oauth2/token`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization: `Basic ${btoa(`${this.clientId}:`)}`
			},
			body: payload.toString()
		});

		if (!res.ok) {
			this.logout();
			throw new Error('Failed to refresh access token');
		}

		const data = await res.json();
		this.updateState({
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresAt: Date.now() + data.expires_in * 1000
		});
	}

	// Method to update the rate limit state
	private updateRateLimit(headers: Headers): void {
		const limit = headers.get('fitbit-rate-limit-limit');
		const remaining = headers.get('fitbit-rate-limit-remaining');
		const reset = headers.get('fitbit-rate-limit-reset');
		const currentState = this.getState();

		this.updateState({
			rateLimitLimit: limit ? parseInt(limit, 10) : currentState.rateLimitLimit,
			rateLimitRemaining: remaining ? parseInt(remaining, 10) : currentState.rateLimitRemaining,
			rateLimitReset: reset ? Date.now() + parseInt(reset, 10) * 1000 : currentState.rateLimitReset
		});
	}

	// Method to update the state
	private updateState(newState: Partial<FitbitState>): void {
		this.state.update((current) => ({ ...current, ...newState }));
	}

	// Method to logout
	public logout(): void {
		this.updateState({
			accessToken: null,
			refreshToken: null,
			userId: null,
			scope: null,
			tokenType: null,
			expiresAt: 0
		});
	}

	// Method to serialize the state
	public toJSON(): string {
		return JSON.stringify(this.getState());
	}

	// Method to deserialize the state
	public fromJSON(json: string): void {
		this.updateState(JSON.parse(json));
	}
}
