<script lang="ts">
	import { onMount } from 'svelte';
	import { FitbitApi } from '$lib/fitbit-api';
	import { goto } from '$app/navigation';
	import { Button } from 'flowbite-svelte';
	import { resolve } from '$app/paths';
	import { get } from 'svelte/store';

	let fitbitApi: FitbitApi;
	let isLoggedIn = false;

	onMount(() => {
		fitbitApi = new FitbitApi();
		const authState = get(fitbitApi.authState);
		isLoggedIn = !!authState.accessToken;

		if (isLoggedIn) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			goto('/download');
		}
	});

	async function login() {
		const loginUrl = await fitbitApi.getLoginUrl();
		window.location.href = loginUrl;
	}
</script>

<div class="py-16 text-center">
	<h1 class="text-4xl font-bold mb-4">Fitbit2Garmin</h1>
	<p class="text-xl mb-8">
		Download your Fitbit data and convert it to a Garmin-compatible format.
	</p>
	{#if !isLoggedIn}
		<Button size="xl" onclick={login}>Download your data</Button>
	{/if}
</div>