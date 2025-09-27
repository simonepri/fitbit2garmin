<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { FitbitAPI } from '$lib/fitbit-api';
	import { DownloadQueue } from '$lib/queue';
	import DownloadQueueForm from '$lib/components/DownloadQueueForm.svelte';
	import DownloadQueueStatus from '$lib/components/DownloadQueueStatus.svelte';
	import DownloadQueueTable from '$lib/components/DownloadQueueTable.svelte';
	import { Button, Spinner, Navbar, NavBrand } from 'flowbite-svelte';

	let fitbitApi = $state<FitbitAPI | null>(null);
	let queue = $state<DownloadQueue | null>(null);
	let isLoading = $state(true);

	onMount(async () => {
		const api = new FitbitAPI();
		if (!api.toJSON().token) {
			const authUrl = await api.getAuthorizationUrl();
			window.location.href = authUrl;
		} else {
			fitbitApi = api;
			queue = new DownloadQueue(fitbitApi);
			isLoading = false;
		}
	});

	function handleLogout() {
		if (
			confirm(
				'Are you sure you want to log out? All your queued and downloaded data will be erased from this browser.'
			)
		) {
			fitbitApi?.logout();
			goto(`${base}/`, { replaceState: true });
		}
	}
</script>

<svelte:head>
	<title>Download Dashboard - Fitbit to Garmin</title>
</svelte:head>

<Navbar class="border-gray-200 dark:border-gray-700 px-4 border-b">
	<NavBrand href="/">
		<span class="text-xl font-semibold dark:text-white self-center whitespace-nowrap"
			>Fitbit to Garmin</span
		>
	</NavBrand>
	<div class="md:order-2 flex">
		{#if fitbitApi}
			<Button color="light" size="sm" onclick={handleLogout}>Logout</Button>
		{/if}
	</div>
</Navbar>

<main class="p-4 container mx-auto">
	{#if isLoading}
		<div class="mt-20 flex flex-col items-center justify-center text-center">
			<Spinner size="10" />
			<p class="mt-4 text-lg text-gray-500 dark:text-gray-400">Loading your data...</p>
		</div>
	{:else if fitbitApi && queue}
		<DownloadQueueForm {queue} />
		<DownloadQueueStatus {queue} {fitbitApi} />
		<DownloadQueueTable {queue} />
	{/if}
</main>
