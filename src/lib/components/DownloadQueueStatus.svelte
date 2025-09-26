<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import type { TaskQueue } from '$lib/queue';
	import type { FitbitAPI } from '$lib/fitbit-api';
	import { toast } from 'svelte-french-toast';

	export let queue: TaskQueue;
	export let fitbitApi: FitbitAPI;

	// Helper function to format milliseconds into a human-readable HH:MM:SS string
	function formatDuration(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
			seconds
		).padStart(2, '0')}`;
	}

	// Helper function to format the time until the API rate limit resets
	function formatTimeUntilReset(resetTimestamp: number): string {
		const secondsRemaining = Math.max(0, Math.floor((resetTimestamp - Date.now()) / 1000));
		const minutes = Math.floor(secondsRemaining / 60);
		const seconds = secondsRemaining % 60;
		return `${minutes}m ${seconds}s`;
	}

	// Function to handle downloading completed files
	async function handleDownload() {
		const blob = await queue.downloadCompleted();
		if (blob) {
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `fitbit-export-${new Date().toISOString().split('T')[0]}.zip`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			toast.success('Download started!');
		} else {
			toast.error('No completed files to download.');
		}
	}

	// Function to handle retrying all failed tasks with confirmation
	function handleRetryAll() {
		if (window.confirm('Are you sure you want to retry all failed tasks?')) {
			queue.retryAllFailed();
			toast.success('Retrying all failed tasks...');
		}
	}

	// Function to handle clearing all data with confirmation
	function handleClearAll() {
		if (
			window.confirm(
				'Are you sure you want to clear all tasks and downloaded data? This cannot be undone.'
			)
		) {
			queue.clearAllData();
			toast.success('All data has been cleared.');
		}
	}

	$: stats = queue.stats;
	$: status = queue.status;
	$: apiState = fitbitApi.state;
</script>

<div
	class="md:flex-row md:items-center md:justify-between gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800 flex flex-col border"
>
	<div class="text-sm text-gray-600 dark:text-gray-300 space-y-1 md:space-y-0">
		<span class="gap-2 flex items-center">
			<span>Status: <span class="font-semibold capitalize">{$status}</span></span>
			<span class="md:inline mx-2 hidden">|</span>
			<span>
				Queue:
				<span class="font-semibold text-green-500">{$stats.completed}</span>/
				<span class="font-semibold text-red-500">{$stats.failed}</span>/
				<span class="font-semibold text-yellow-500">{$stats.pending}</span>
				(C/F/P)
			</span>
		</span>
		<span class="gap-2 flex items-center">
			<span
				>Total Elapsed: <span class="font-semibold">{formatDuration($stats.totalRuntime)}</span
				></span
			>
			<span class="md:inline mx-2 hidden">|</span>
			<span>
				API Quota:
				<span class="font-semibold">{$apiState.rateLimitRemaining}/{$apiState.rateLimitLimit}</span>
				(resets in
				<span class="font-semibold">{formatTimeUntilReset($apiState.rateLimitReset)}</span>)
			</span>
		</span>
	</div>

	<div class="gap-2 flex items-center">
		<Button
			size="sm"
			onclick={handleDownload}
			disabled={$stats.completed === 0 || $status === 'running'}
		>
			Download Completed
		</Button>
		<Button
			size="sm"
			color="alternative"
			onclick={handleRetryAll}
			disabled={$stats.failed === 0 || $status === 'running'}
		>
			Retry Failed
		</Button>
		<Button size="sm" color="red" onclick={handleClearAll} disabled={$stats.total === 0}>
			Clear All
		</Button>
	</div>
</div>
