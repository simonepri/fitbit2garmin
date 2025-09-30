<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { fitbitApi } from '$lib/stores';

	import DownloadQueueForm from '$lib/components/DownloadQueueForm.svelte';
	import DownloadQueueStatus from '$lib/components/DownloadQueueStatus.svelte';
	import DownloadQueueTable from '$lib/components/DownloadQueueTable.svelte';

	const { isLoggedIn } = fitbitApi;

	onMount(() => {
		if (browser && !$isLoggedIn) {
			goto('/');
		}
	});
</script>

{#if $isLoggedIn}
	<div class="space-y-6">
		<h1 class="text-3xl font-bold">Download Dashboard</h1>

		<DownloadQueueStatus />

		<DownloadQueueForm />

		<DownloadQueueTable />
	</div>
{:else}
	<!-- Show a loading or placeholder state while we check auth -->
	<div class="text-center pt-20">
		<p>Loading...</p>
	</div>
{/if}