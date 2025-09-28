<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import type { Task } from '$lib/tasks';
	import type { FitbitApi } from '$lib/fitbit-api';
	import { get } from 'svelte/store';

	export let queueStatus: 'idle' | 'running';
	export let tasks: Task[];
	export let fitbitApi: FitbitApi;

	export let onErase: () => void;
	export let onRetryFailed: () => void;
	export let onDownloadCompleted: () => void;

	$: completedTasks = tasks.filter((t) => t.status === 'completed').length;
	$: failedTasks = tasks.filter((t) => t.status === 'failed').length;
	$: pendingTasks = tasks.filter(
		(t) => t.status === 'pending' || t.status === 'downloading'
	).length;
	$: totalRuntime = tasks.reduce((acc, t) => acc + t.runtime, 0);

	function formatTime(ms: number) {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
	}

	function formatTimeUntilReset(seconds: number) {
		const minutes = Math.floor(seconds / 60);
		return `${minutes}m ${seconds % 60}s`;
	}

	$: rateLimit = get(fitbitApi.authState)?.rateLimit;
</script>

<div
	class="md:flex-row gap-4 p-4 bg-gray-800 rounded-lg flex flex-col items-center justify-between"
>
	<div class="flex-grow">
		<span>Status: <span class="font-bold">{queueStatus}</span></span> |
		<span
			>Queue: <span class="font-bold">{completedTasks}/{failedTasks}/{pendingTasks} (C/F/P)</span
			></span
		>
		|
		<span>Elapsed: <span class="font-bold">{formatTime(totalRuntime)}</span></span> |
		{#if rateLimit}
			<span
				>API Quota: <span class="font-bold">{rateLimit.remaining}/{rateLimit.limit}</span> (resets
				in {formatTimeUntilReset(rateLimit.reset)})</span
			>
		{/if}
	</div>
	<div class="gap-2 flex">
		<Button color="red" onclick={onErase}>Erase Data</Button>
		<Button color="yellow" onclick={onRetryFailed}>Retry Failed</Button>
		<Button color="green" onclick={onDownloadCompleted}>Download Completed</Button>
	</div>
</div>
