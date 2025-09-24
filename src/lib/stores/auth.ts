import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { FitbitToken } from '$lib/types';

const TOKEN_STORAGE_KEY = 'fitbit_token';

function createAuthStore() {
	const { subscribe, set } = writable<FitbitToken | null>(null, (set) => {
		if (browser) {
			const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
			if (storedToken) {
				try {
					const token: FitbitToken = JSON.parse(storedToken);
					// Check if token is expired, if so, start as logged out
					if (Date.now() / 1000 > token.ts + token.expires_in) {
						localStorage.removeItem(TOKEN_STORAGE_KEY);
						set(null);
					} else {
						set(token);
					}
				} catch {
					localStorage.removeItem(TOKEN_STORAGE_KEY);
					set(null);
				}
			}
		}
	});

	function setToken(token: FitbitToken | null) {
		if (browser) {
			if (token) {
				localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
			} else {
				localStorage.removeItem(TOKEN_STORAGE_KEY);
			}
		}
		set(token);
	}

	function logout() {
		setToken(null);
	}

    function updateToken(token: FitbitToken) {
        setToken(token);
    }

	return {
		subscribe,
		set: setToken,
        updateToken,
		logout
	};
}

export const auth = createAuthStore();
