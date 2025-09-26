<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { FitbitAPI } from '$lib/fitbit-api';
	import { Spinner } from 'flowbite-svelte';
	import { toast } from 'svelte-french-toast';
	import type { TaskQueue } from '$lib/queue';

	const fitbitApi = getContext<FitbitAPI>('fitbitApi');

	onMount(async () => {
		const code = $page.url.searchParams.get('code');
		const state = $page.url.searchParams.get('state');

		const storedState = localStorage.getItem('fitbitOauthState');
		const codeVerifier = localStorage.getItem('fitbitOauthCodeVerifier');

		if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
			toast.error('Authentication failed. Invalid state or code.');
			goto('/', { replaceState: true });
			return;
		}

		try {
			await fitbitApi.handleOAuthCallback(code, codeVerifier, state);
			const userId = fitbitApi.getState().userId;
			if (userId) {
				// The queue is initialized in the layout, but we ensure it's done here too
				const queue = getContext<TaskQueue>('queue');
				await queue.init(userId);
				toast.success('Successfully authenticated!');
				goto('/download', { replaceState: true });
			} else {
				throw new Error('User ID not found after authentication.');
			}
		} catch (error) {
			console.error('Authentication error:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			toast.error(`Authentication failed: ${errorMessage}`);
			goto('/', { replaceState: true });
		} finally {
			localStorage.removeItem('fitbitOauthState');
			localStorage.removeItem('fitbitOauthCodeVerifier');
		}
	});
</script>

<div class="mt-20 flex flex-col items-center justify-center">
	<Spinner size="12" />
	<p class="mt-4">Authenticating with Fitbit, please wait...</p>
</div>
