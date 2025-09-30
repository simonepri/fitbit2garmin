import { browser } from '$app/environment';
import { FitbitAPI } from './fitbit-api';
import { DownloadQueueManager } from './queue';
import { writable } from 'svelte/store';

export let fitbitApi: FitbitAPI;
export let queueManager: DownloadQueueManager;

if (browser) {
	// On the client, create the real instances.
	fitbitApi = new FitbitAPI();
	queueManager = new DownloadQueueManager();
} else {
	// On the server, create inert mock instances that extend the real classes.
	// This ensures they have the correct shape and methods, preventing SSR errors.
	class ServerFitbitAPI extends FitbitAPI {
		constructor() {
			super();
			// Prevent any browser-specific logic in constructor if it exists
		}
		// Override methods that use `fetch` or other browser APIs
		protected async apiFetch(): Promise<Response> {
			return new Response('{}', {
				headers: { 'Content-Type': 'application/json' }
			});
		}
		async getAuthorizationUrl() {
			return { url: '#', codeVerifier: '' };
		}
		async handleAuthCallback() {
			return;
		}
		saveToLocalStorage() {
			// Do nothing on the server
		}
		logout() {
			// Do nothing on the server
		}
	}

	class ServerDownloadQueueManager extends DownloadQueueManager {
		async init() {
			// Do nothing on the server
		}
		async startProcessing() {
			// Do nothing on the server
		}
	}

	fitbitApi = new ServerFitbitAPI();
	queueManager = new ServerDownloadQueueManager();
}