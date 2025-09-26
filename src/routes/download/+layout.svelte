<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { FitbitAPI } from '$lib/fitbit-api';
	import { Button, Heading } from 'flowbite-svelte';
	import { toast } from 'svelte-french-toast';
	import type { TaskQueue } from '$lib/queue';

	const fitbitApi = getContext<FitbitAPI>('fitbitApi');
	const queue = getContext<TaskQueue>('queue');
	const { isAuthenticated } = fitbitApi;

	onMount(() => {
		// If the user is not authenticated, redirect them to the home page.
		if (!$isAuthenticated) {
			goto('/', { replaceState: true });
		}
	});

	function handleLogout() {
		if (window.confirm('Are you sure you want to log out? All local data will be erased.')) {
			fitbitApi.logout();
			queue.clearAllData();
			localStorage.clear();
			toast.success('You have been logged out.');
			goto('/', { replaceState: true });
		}
	}
</script>

<div class="mb-6 flex items-center justify-between">
	<Heading tag="h1">Download Dashboard</Heading>
	<Button color="light" onclick={handleLogout}>Logout</Button>
</div>

<slot />
