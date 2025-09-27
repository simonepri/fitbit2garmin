import { PUBLIC_FITBIT_CLIENT_ID, PUBLIC_FITBIT_REDIRECT_URI } from '$env/static/public';
import { persisted } from 'svelte-local-storage-store';
import { get, writable } from 'svelte/store';
import jsSHA from 'jssha';

const FITBIT_API_BASE_URL = 'https://api.fitbit.com';
const FITBIT_OAUTH2_BASE_URL = 'https://www.fitbit.com/oauth2';

export const FITBIT_API_RATE_LIMIT = 150;
export const FITBIT_API_RATE_INTERVAL = 60 * 60;

export type FitbitApiRateLimit = {
	limit: number;
	remaining: number;
	reset: number;
};

export const fitbitApiRateLimit = writable<FitbitApiRateLimit>({
	limit: FITBIT_API_RATE_LIMIT,
	remaining: FITBIT_API_RATE_LIMIT,
	reset: FITBIT_API_RATE_INTERVAL
});

export const fitbitAuth = persisted('fitbit-auth', {
	access_token: '',
	expires_in: 0,
	refresh_token: '',
	scope: '',
	token_type: '',
	user_id: '',
	ts: 0
});

export const fitbitPkce = persisted('fitbit-pkce', {
	codeVerifier: '',
	state: ''
});

export const isLoggedIn = writable(false);

fitbitAuth.subscribe(($auth) => {
	isLoggedIn.set(!!$auth.access_token);
});

function base64UrlEncode(str: string) {
	return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createCodeChallenge(v: string) {
	const shaObj = new jsSHA('SHA-256', 'TEXT', { encoding: 'UTF8' });
	shaObj.update(v);
	const hash = shaObj.getHash('ARRAYBUFFER');
	return base64UrlEncode(String.fromCharCode.apply(null, new Uint8Array(hash)));
}

export async function getOAuth2AuthorizationUrl() {
	const codeVerifier = crypto.randomUUID();
	const state = crypto.randomUUID();
	const codeChallenge = await createCodeChallenge(codeVerifier);

	fitbitPkce.set({ codeVerifier, state });

	const params = {
		client_id: PUBLIC_FITBIT_CLIENT_ID || '23TJVT',
		redirect_uri: PUBLIC_FITBIT_REDIRECT_URI || `${location.origin}/fitbit-auth`,
		scope: 'weight activity profile',
		code_challenge: codeChallenge,
		code_challenge_method: 'S256',
		response_type: 'code',
		state
	};

	return `${FITBIT_OAUTH2_BASE_URL}/authorize?${new URLSearchParams(params)}`;
}

export async function getOAuth2Token(code: string, state: string) {
	const pkce = get(fitbitPkce);
	if (state !== pkce.state) {
		throw new Error('Invalid state');
	}

	const params = {
		client_id: PUBLIC_FITBIT_CLIENT_ID || '23TJVT',
		grant_type: 'authorization_code',
		redirect_uri: PUBLIC_FITBIT_REDIRECT_URI || `${location.origin}/fitbit-auth`,
		code,
		code_verifier: pkce.codeVerifier
	};

	const response = await fetch(`${FITBIT_API_BASE_URL}/oauth2/token`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams(params)
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch token: ${response.statusText}`);
	}

	const auth = await response.json();
	auth.ts = Date.now();
	fitbitAuth.set(auth);
	fitbitPkce.set({ codeVerifier: '', state: '' });
}

export async function refreshToken() {
	const auth = get(fitbitAuth);

	const params = {
		grant_type: 'refresh_token',
		refresh_token: auth.refresh_token,
		client_id: PUBLIC_FITBIT_CLIENT_ID || '23TJVT'
	};

	const response = await fetch(`${FITBIT_API_BASE_URL}/oauth2/token`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams(params)
	});

	if (!response.ok) {
		throw new Error(`Failed to refresh token: ${response.statusText}`);
	}

	const newAuth = await response.json();
	newAuth.ts = Date.now();
	fitbitAuth.set(newAuth);
}

export async function apiFetch(path: string, options: RequestInit = {}) {
	const auth = get(fitbitAuth);
	if (auth.ts + auth.expires_in * 1000 < Date.now()) {
		await refreshToken();
	}

	const response = await fetch(`/api/fitbit-proxy/${path}`, {
		...options,
		headers: {
			...options.headers,
			Authorization: `Bearer ${get(fitbitAuth).access_token}`
		}
	});

	const limit = response.headers.get('fitbit-rate-limit-limit');
	const remaining = response.headers.get('fitbit-rate-limit-remaining');
	const reset = response.headers.get('fitbit-rate-limit-reset');

	fitbitApiRateLimit.set({
		limit: limit ? parseInt(limit) : FITBIT_API_RATE_LIMIT,
		remaining: remaining ? parseInt(remaining) : FITBIT_API_RATE_LIMIT,
		reset: reset ? parseInt(reset) : FITBIT_API_RATE_INTERVAL
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`Fitbit API request failed for path ${path} with status ${response.status}: ${errorText}`
		);
	}

	return response;
}

export function logout() {
	fitbitAuth.set({
		access_token: '',
		expires_in: 0,
		refresh_token: '',
		scope: '',
		token_type: '',
		user_id: '',
		ts: 0
	});
	fitbitPkce.set({
		codeVerifier: '',
		state: ''
	});
}
