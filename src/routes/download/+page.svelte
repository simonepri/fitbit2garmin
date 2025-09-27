<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isLoggedIn, logout } from '$lib/fitbit-api';
	import { DownloadQueue, downloadQueue } from '$lib/queue';
	import DownloadQueueForm from '$lib/components/DownloadQueueForm.svelte';
	import DownloadQueueStatus from '$lib/components/DownloadQueueStatus.svelte';
	import DownloadQueueTable from '$lib/components/DownloadQueueTable.svelte';
	import { Button, Card } from 'flowbite-svelte';
	import { toast } from 'flowbite-svelte';
	import { get } from 'svelte/store';

	onMount(() => {
		if (!get(isLoggedIn)) {
			goto('/');
		} else {
			// Initialize the queue instance in the store if it doesn't exist
			if (!get(downloadQueue)) {
				const queue = new DownloadQueue();
				queue.init();
				downloadQueue.set(queue);
			}
		}
	});

	function handleLogout() {
		if (confirm('Are you sure you want to logout? All local data will be erased.')) {
			logout();
			const queue = get(downloadQueue);
			if (queue) {
				queue.eraseData();
				downloadQueue.set(null);
			}
			toast.success('You have been logged out.');
			goto('/');
		}
	}
</script>

{#if $isLoggedIn}
	<div class="space-y-6">
		<div class="flex items-center justify-between">
			<h1 class="text-3xl font-bold">Download Dashboard</h1>
			<Button onclick={handleLogout} color="light">Logout</Button>
		</div>

		<Card>
			<DownloadQueueForm />
		</Card>

		{#if $downloadQueue}
			<DownloadQueueStatus />
			<DownloadQueueTable />
		{/if}
	</div>
{/if}
