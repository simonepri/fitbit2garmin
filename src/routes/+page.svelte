<script lang="ts">
	import { Button, Card } from 'flowbite-svelte';
	import { isLoggedIn, getOAuth2AuthorizationUrl } from '$lib/fitbit-api';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let authUrl = '';

	onMount(async () => {
		authUrl = await getOAuth2AuthorizationUrl();
	});

	function login() {
		if (authUrl) {
			window.location.href = authUrl;
		}
	}

	function goToDownload() {
		goto('/download');
	}
</script>

<div class="flex h-[calc(100vh-200px)] items-center justify-center">
	<Card class="max-w-lg text-center">
		<h1 class="mb-4 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
			Download Your Fitbit Data for Garmin
		</h1>
		<p class="mb-6 font-normal text-gray-700 dark:text-gray-400">
			This tool allows you to download your weight, activity, and TCX data directly from your
			Fitbit account and convert it into a Garmin-compatible format.
		</p>

		{#if $isLoggedIn}
			<Button onclick={goToDownload} size="lg">Go to Download Dashboard</Button>
		{:else}
			<Button onclick={login} size="lg" disabled={!authUrl}>
				{#if !authUrl}
					Loading...
				{:else}
					Login with Fitbit & Download Your Data
				{/if}
			</Button>
		{/if}
	</Card>
</div>