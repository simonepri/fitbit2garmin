<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from 'flowbite-svelte';
	import { get } from 'svelte/store';
	import { keys } from '$lib/keys';
	import type { FitbitApi } from '$lib/fitbit-api';

	const fitbitApi = getContext<FitbitApi>(keys.fitbitApi);

	let isLoggedIn = false;

	onMount(() => {
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
	<h1 class="mb-4 text-4xl font-bold">Fitbit2Garmin</h1>
	<p class="mb-8 text-xl">
		Download your Fitbit data and convert it to a Garmin-compatible format.
	</p>
	{#if !isLoggedIn}
		<Button size="xl" onclick={login}>Download your data</Button>
	{/if}
</div>
