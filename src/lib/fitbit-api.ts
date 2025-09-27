import {
	PUBLIC_FITBIT_CLIENT_ID,
	PUBLIC_FITBIT_PROXY_ADDRESS,
	PUBLIC_FITBIT_REDIRECT_URI
} from '$env/static/public';
import { browser } from '$app/environment';
import { writable, type Writable } from 'svelte/store';

// --- Constants ---
const FITBIT_API_BASE_URL = 'https://api.fitbit.com';
const FITBIT_OAUTH2_BASE_URL = 'https://www.fitbit.com/oauth2';
const API_VERSION = 1;

// --- Interfaces ---
export interface FitbitToken {
	access_token: string;
	expires_in: number;
	refresh_token: string;
	scope: string;
	token_type: string;
	user_id: string;
	ts: number; // Timestamp of when the token was received
}

export interface FitbitWeightLog {
	bmi: number;
	date: string;
	logId: number;
	time: string;
	weight: number;
	source: string;
	fat?: number;
}

export interface FitbitActivityLog {
	logId: number;
	originalStartTime: string;
	logType: 'manual' | 'auto_detected' | 'mobile_run';
}

export interface FitbitTimeSeriesData {
	dateTime: string;
	value: string;
}

export interface FitbitRateLimit {
	limit: number;
	remaining: number;
	reset: number; // Seconds until reset
	resetDate: number; // Timestamp of when the rate limit will reset
}

interface FitbitAPIState {
	token: FitbitToken | null;
	rateLimit: FitbitRateLimit;
	codeVerifier: string | null;
}

interface Storage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

// --- Helper Functions ---

async function generateCodeVerifier(): Promise<string> {
	const randomBytes = new Uint8Array(64);
	crypto.getRandomValues(randomBytes);
	return btoa(String.fromCharCode.apply(null, Array.from(randomBytes)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

// --- FitbitAPI Class ---

export class FitbitAPI {
	private state: FitbitAPIState;
	private storage: Storage;
	private storageKey: string;

	public isLoggedIn: Writable<boolean>;
	public rateLimit: Writable<FitbitRateLimit>;

	private clientId: string;
	private redirectUri: string;
	private proxyAddress: string;
	private aSleep?: Promise<void>;

	constructor(
		storageKey = 'fitbit-api-state',
		storage: Storage = browser ? localStorage : ({} as Storage)
	) {
		this.storageKey = storageKey;
		this.storage = storage;

		this.clientId = PUBLIC_FITBIT_CLIENT_ID || '23TJVT';
		this.redirectUri =
			PUBLIC_FITBIT_REDIRECT_URI ||
			new URL('/fitbit-auth', browser ? window.location.origin : 'http://localhost').toString();
		this.proxyAddress = PUBLIC_FITBIT_PROXY_ADDRESS || '/api/fitbit-proxy';

		this.state = this.loadState() || {
			token: null,
			rateLimit: { limit: 150, remaining: 150, reset: 3600, resetDate: Date.now() + 3600 * 1000 },
			codeVerifier: null
		};

		this.isLoggedIn = writable(!!this.state.token);
		this.rateLimit = writable(this.state.rateLimit);
	}

	private saveState(): void {
		if (!browser) return;
		try {
			const serializedState = JSON.stringify(this.state);
			this.storage.setItem(this.storageKey, serializedState);
		} catch (error) {
			console.error('Failed to save Fitbit API state:', error);
		}
	}

	private loadState(): FitbitAPIState | null {
		if (!browser) return null;
		try {
			const serializedState = this.storage.getItem(this.storageKey);
			if (serializedState === null) {
				return null;
			}
			const state = JSON.parse(serializedState);
			// Basic validation
			if (state && typeof state.rateLimit === 'object') {
				return state;
			}
			return null;
		} catch (error) {
			console.error('Failed to load Fitbit API state:', error);
			return null;
		}
	}

	public toJSON() {
		return this.state;
	}

	static fromJSON(json: FitbitAPIState, storageKey?: string, storage?: Storage): FitbitAPI {
		const api = new FitbitAPI(storageKey, storage);
		api.state = json;
		api.isLoggedIn.set(!!json.token);
		api.rateLimit.set(json.rateLimit);
		return api;
	}

	async getAuthorizationUrl(): Promise<string> {
		const codeVerifier = await generateCodeVerifier();
		this.state.codeVerifier = codeVerifier;
		this.saveState();

		const codeChallenge = await generateCodeChallenge(codeVerifier);
		const state = btoa(crypto.getRandomValues(new Uint8Array(16)).toString());

		const params = new URLSearchParams({
			client_id: this.clientId,
			redirect_uri: this.redirectUri,
			scope: 'weight activity location',
			code_challenge: codeChallenge,
			code_challenge_method: 'S256',
			response_type: 'code',
			state: state
		});

		return `${FITBIT_OAUTH2_BASE_URL}/authorize?${params.toString()}`;
	}

	async handleAuthCallback(code: string): Promise<void> {
		if (!this.state.codeVerifier) {
			throw new Error('No code verifier found. Please start the auth flow again.');
		}

		const body = new URLSearchParams({
			client_id: this.clientId,
			grant_type: 'authorization_code',
			redirect_uri: this.redirectUri,
			code: code,
			code_verifier: this.state.codeVerifier
		});

		const url = `${this.proxyAddress}/oauth2/token`;
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body
		});

		if (!response.ok) {
			throw new Error(`Failed to exchange authorization code for token: ${response.statusText}`);
		}

		const tokenData: Omit<FitbitToken, 'ts'> = await response.json();
		this.state.token = { ...tokenData, ts: Date.now() };
		this.state.codeVerifier = null;
		this.isLoggedIn.set(true);
		this.saveState();
	}

	private async refreshToken(): Promise<void> {
		if (!this.state.token) {
			throw new Error('Cannot refresh token: user is not logged in.');
		}

		const body = new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: this.state.token.refresh_token,
			client_id: this.clientId
		});

		const url = `${this.proxyAddress}/oauth2/token`;
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body
		});

		if (!response.ok) {
			console.error('Failed to refresh token, logging out.', await response.text());
			this.logout();
			throw new Error('Fitbit token refresh failed.');
		}

		const tokenData: Omit<FitbitToken, 'ts'> = await response.json();
		this.state.token = { ...tokenData, ts: Date.now() };
		this.isLoggedIn.set(true);
		this.saveState();
	}

	public logout(): void {
		this.state.token = null;
		this.state.codeVerifier = null;
		this.state.rateLimit = {
			limit: 150,
			remaining: 150,
			reset: 3600,
			resetDate: Date.now() + 3600 * 1000
		};
		this.isLoggedIn.set(false);
		this.rateLimit.set(this.state.rateLimit);
		this.saveState();
	}

	private updateRateLimit(headers: Headers): void {
		const limit = headers.get('fitbit-rate-limit-limit');
		const remaining = headers.get('fitbit-rate-limit-remaining');
		const reset = headers.get('fitbit-rate-limit-reset');

		if (limit && remaining && reset) {
			const newRateLimit: FitbitRateLimit = {
				limit: parseInt(limit, 10),
				remaining: parseInt(remaining, 10),
				reset: parseInt(reset, 10),
				resetDate: Date.now() + parseInt(reset, 10) * 1000
			};
			this.state.rateLimit = newRateLimit;
			this.rateLimit.set(newRateLimit);
			this.saveState();
		}
	}

	public async apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
		if (!this.state.token) {
			throw new Error('Not authenticated');
		}

		const now = Date.now();
		const tokenExpires = this.state.token.ts + this.state.token.expires_in * 1000;
		if (now >= tokenExpires) {
			await this.refreshToken();
		}

		// Wait for the previous sleep to complete, if any
		if (this.aSleep) {
			await this.aSleep;
		}

		const rateLimit = this.state.rateLimit;
		if (rateLimit.remaining <= 1) {
			const now = Date.now();
			const timeToWait = Math.max(0, rateLimit.resetDate - now);
			if (timeToWait > 0) {
				console.warn(`Rate limit nearly exceeded. Waiting for ${timeToWait / 1000} seconds.`);
				// Set a new sleep promise
				this.aSleep = new Promise((resolve) => setTimeout(resolve, timeToWait));
				await this.aSleep;
				// Once the wait is over, clear the promise
				this.aSleep = undefined;
			}
		}

		const url = `${this.proxyAddress}/${API_VERSION}${endpoint}`;
		const response = await fetch(url, {
			...options,
			headers: {
				...options.headers,
				Authorization: `Bearer ${this.state.token.access_token}`
			}
		});

		this.updateRateLimit(response.headers);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(
				`Fitbit API error on ${endpoint}: ${response.status} ${response.statusText}`,
				errorText
			);
			throw new Error(`Fitbit API error: ${response.statusText}`);
		}

		return response;
	}

	// --- Specific API Methods ---

	public async getWeightLogs(
		startDate: string,
		endDate: string
	): Promise<{ weight: FitbitWeightLog[] }> {
		const endpoint = `/user/-/body/log/weight/date/${startDate}/${endDate}.json`;
		const response = await this.apiFetch(endpoint);
		return response.json();
	}

	public async getActivityLogs(date: string): Promise<{ activities: FitbitActivityLog[] }> {
		const endpoint = `/user/-/activities/list.json?afterDate=${date}&sort=asc&offset=0&limit=100`;
		const response = await this.apiFetch(endpoint);
		return response.json();
	}

	public async getActivityTCX(logId: number): Promise<string> {
		const endpoint = `/user/-/activities/${logId}.tcx`;
		const response = await this.apiFetch(endpoint);
		return response.text();
	}

	public async getActivityTimeSeries(
		resource: string,
		startDate: string,
		endDate: string
	): Promise<{ [key: string]: FitbitTimeSeriesData[] }> {
		const endpoint = `/user/-/activities/${resource}/date/${startDate}/${endDate}.json`;
		const response = await this.apiFetch(endpoint);
		return response.json();
	}
}
