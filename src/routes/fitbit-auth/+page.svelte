<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { FitbitAPI } from '$lib/fitbit-api';
	import { Spinner, Alert, Button } from 'flowbite-svelte';

	let error: string | null = null;
	let fitbitApi: FitbitAPI;

	onMount(async () => {
		fitbitApi = new FitbitAPI();
		const code = $page.url.searchParams.get('code');
		const state = $page.url.searchParams.get('state');

		if (!code || !state) {
			error = 'Invalid callback parameters. Please try logging in again.';
			return;
		}

		try {
			await fitbitApi.handleAuthCallback(code);
			goto(`${base}/download`, { replaceState: true });
		} catch (err) {
			console.error('Authentication failed:', err);
			error =
				err instanceof Error ? err.message : 'An unknown error occurred during authentication.';
		}
	});
</script>

<div class="p-4 flex min-h-screen flex-col items-center justify-center text-center">
	{#if error}
		<Alert color="red" class="max-w-md">
			<h3 class="font-medium text-lg">Authentication Failed</h3>
			<p>{error}</p>
			<Button href="/" color="red" class="mt-4">Go back home</Button>
		</Alert>
	{:else}
		<Spinner size="12" />
		<h1 class="text-2xl font-semibold mt-4">Authenticating with Fitbit...</h1>
		<p class="text-gray-500 dark:text-gray-400">Please wait, you will be redirected shortly.</p>
	{/if}
</div>
