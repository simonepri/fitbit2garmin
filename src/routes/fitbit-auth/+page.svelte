<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { FitbitApi } from '$lib/fitbit-api';
	import { Spinner } from 'flowbite-svelte';

	let error: string | null = null;

	onMount(async () => {
		const code = $page.url.searchParams.get('code');
		if (!code) {
			error = 'No authorization code found. Please try logging in again.';
			return;
		}

		const fitbitApi = new FitbitApi();
		try {
			await fitbitApi.exchangeCodeForToken(code);
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			goto('/download');
		} catch (e) {
			console.error(e);
			error = 'Failed to authenticate with Fitbit. Please try again.';
		}
	});
</script>

<div class="flex h-full flex-col items-center justify-center text-center">
	{#if error}
		<p class="text-red-500">{error}</p>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/" class="mt-4 text-blue-500 hover:underline">Go to Home</a>
	{:else}
		<Spinner size="12" />
		<p class="mt-4">Authenticating with Fitbit...</p>
	{/if}
</div>