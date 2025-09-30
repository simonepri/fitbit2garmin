<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import Navbar from '$lib/components/Navbar.svelte';
	import { fitbitApi, queueManager } from '$lib/stores';
	import { FitbitAPI } from '$lib/fitbit-api';

	const LAST_USER_ID_KEY = 'fitbit_last_user_id';

	onMount(async () => {
		if (browser) {
			// Check for a logged-in user from a previous session
			const lastUserId = localStorage.getItem(LAST_USER_ID_KEY);

			if (lastUserId) {
				const storedApi = FitbitAPI.loadFromLocalStorage(lastUserId);
				if (storedApi && storedApi.hasValidToken()) {
					// If we have a valid stored session, re-assign the global store instance
					Object.assign(fitbitApi, storedApi);

					// Now initialize the queue manager with the authenticated API
					await queueManager.init(fitbitApi);
					queueManager.startProcessing();
				} else {
					// If the token is invalid or data is corrupt, clear it
					localStorage.removeItem(LAST_USER_ID_KEY);
				}
			}

			// Subscribe to user ID changes to handle data integrity
			fitbitApi.userId.subscribe(async (newUserId) => {
				const lastUserId = localStorage.getItem(LAST_USER_ID_KEY);
				if (newUserId && newUserId !== lastUserId) {
					// New user logged in, clear old data if it exists
					if (lastUserId) {
						await queueManager.clearAllData();
						localStorage.removeItem(`fitbit_auth_${lastUserId}`);
					}
					localStorage.setItem(LAST_USER_ID_KEY, newUserId);
					// Re-init queue manager for the new user
					await queueManager.init(fitbitApi);
					queueManager.startProcessing();
				} else if (!newUserId) {
					localStorage.removeItem(LAST_USER_ID_KEY);
				}
			});

			if (import.meta.env.MODE === 'test') {
				// @ts-ignore
				window.app = {
					queueManager,
					fitbitApi
				};
			}
		}
	});
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
	<Navbar />
	<main class="container mx-auto p-4">
		<slot />
	</main>
</div>