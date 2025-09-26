<script lang="ts">
	import { onMount } from 'svelte';
	import { getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button, Heading } from 'flowbite-svelte';
	import type { FitbitAPI } from '$lib/fitbit-api';

	const fitbitApi = getContext<FitbitAPI>('fitbitApi');
	const { isAuthenticated } = fitbitApi;

	onMount(() => {
		// If the user is already authenticated when they land here, redirect them.
		if ($isAuthenticated) {
			goto('/download', { replaceState: true });
		}
	});

	async function handleLogin() {
		const state = Math.random().toString(36).substring(2);
		localStorage.setItem('fitbitOauthState', state);

		const { url, codeVerifier } = await fitbitApi.getAuthorizationUrl(
			'weight activity profile',
			state
		);
		localStorage.setItem('fitbitOauthCodeVerifier', codeVerifier);

		window.location.href = url;
	}
</script>

<div class="mt-20 text-center">
	<Heading tag="h1" class="mb-4">Fitbit to Garmin Exporter</Heading>
	<p class="mb-8">Download your Fitbit data and convert it to a Garmin-compatible format.</p>
	<Button size="xl" onclick={handleLogin}>
		<svg
			class="w-6 h-6 mr-2"
			fill="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			><path
				d="M12,2A10,10,0,1,0,22,12,10,10,0,0,0,12,2Zm4.25,12.86H13.11V11.72a1.72,1.72,0,0,1,1.72-1.72h1.42V7.14h-2.2a4.58,4.58,0,0,0-4.58,4.58v3.14H6.75v2.86h2.74v4.28h3.62V17.72h2.39Z"
			/></svg
		>
		Login with Fitbit & Download Data
	</Button>
</div>
