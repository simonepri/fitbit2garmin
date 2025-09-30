<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { fitbitApi } from '$lib/stores';
	import { Spinner } from 'flowbite-svelte';

	const CODE_VERIFIER_KEY = 'fitbit_code_verifier';
	let error: string | null = null;

	onMount(async () => {
		if (!browser) return;

		const code = $page.url.searchParams.get('code');
		const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY);

		if (!code || !codeVerifier) {
			error = 'Authentication failed: Missing authorization code or verifier. Please try again.';
			return;
		}

		try {
			// Clear the verifier from storage now that we've used it
			sessionStorage.removeItem(CODE_VERIFIER_KEY);

			await fitbitApi.handleAuthCallback(code, codeVerifier);

			// Success! Redirect to the main download page.
			goto('/download');

		} catch (e: any) {
			console.error('Error during Fitbit auth callback:', e);
			error = `Failed to authenticate with Fitbit. Please try again. Details: ${e.message}`;
		}
	});
</script>

<div class="flex flex-col items-center justify-center pt-20 text-center">
	{#if error}
		<h1 class="text-2xl font-bold text-red-500 mb-4">Authentication Error</h1>
		<p class="text-lg text-gray-600 dark:text-gray-400">{error}</p>
	{:else}
		<h1 class="text-2xl font-bold mb-4">Authenticating with Fitbit...</h1>
		<p class="text-lg text-gray-600 dark:text-gray-400 mb-8">
			Please wait while we securely complete the login process. You will be redirected shortly.
		</p>
		<Spinner size="12" />
	{/if}
</div>