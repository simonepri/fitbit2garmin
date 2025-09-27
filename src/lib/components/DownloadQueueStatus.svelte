<script lang="ts">
	import { Button, Progressbar, Spinner } from 'flowbite-svelte';
	import { DownloadOutline, RefreshOutline, TrashBinOutline } from 'flowbite-svelte-icons';
	import type { DownloadQueue } from '$lib/queue';
	import type { FitbitAPI, FitbitRateLimit } from '$lib/fitbit-api';
	import { derived } from 'svelte/store';

	let { queue, fitbitApi } = $props<{ queue: DownloadQueue; fitbitApi: FitbitAPI }>();

	const stats = queue.stats;
	const queueStatus = queue.status;
	const rateLimit = fitbitApi.rateLimit;

	const timeUntilReset = derived(rateLimit, ($rateLimit: FitbitRateLimit) => {
		const now = Date.now();
		const resetTime = $rateLimit.resetDate;
		if (resetTime <= now) {
			return 'now';
		}
		const secondsLeft = Math.round((resetTime - now) / 1000);
		const minutes = Math.floor(secondsLeft / 60);
		const seconds = secondsLeft % 60;
		return `${minutes}m ${seconds}s`;
	});

	function formatDuration(ms: number) {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(
			seconds % 60
		).padStart(2, '0')}`;
	}

	async function handleDownload() {
		try {
			const blob = await queue.generateZip();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'fitbit_export.zip';
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error('Failed to generate zip:', error);
			alert('Failed to generate zip file. Check console for details.');
		}
	}

	function handleErase() {
		if (
			confirm(
				'Are you sure you want to erase all queued and downloaded data? This cannot be undone.'
			)
		) {
			queue.clearData();
		}
	}
</script>

<div
	class="md:flex-row gap-4 p-4 my-4 bg-gray-100 dark:bg-gray-800 rounded-lg flex flex-col items-center"
>
	<div class="text-sm text-gray-700 dark:text-gray-300 flex-grow">
		<div class="gap-2 flex items-center">
			<span>Status:</span>
			<span class="font-semibold capitalize">{$queueStatus}</span>
			{#if $queueStatus === 'running'}
				<Spinner size="4" />
			{/if}
		</div>
		<div>
			Queue:
			<span class="font-semibold">{$stats.completed}/{$stats.failed}/{$stats.pending}</span>
			(C/F/P)
		</div>
		<div>
			Elapsed:
			<span class="font-semibold">{formatDuration($stats.runtime)}</span>
		</div>
		<div>
			API Quota:
			<span class="font-semibold">{$rateLimit.remaining}/{$rateLimit.limit}</span>
			(resets in {$timeUntilReset})
		</div>
		<Progressbar progress={($rateLimit.remaining / $rateLimit.limit) * 100} class="mt-1" />
	</div>

	<div class="gap-2 flex items-center">
		<Button color="red" size="sm" onclick={handleErase}>
			<TrashBinOutline class="w-4 h-4 mr-2" />
			Erase Data
		</Button>
		<Button color="alternative" size="sm" onclick={() => queue.retryFailed()}>
			<RefreshOutline class="w-4 h-4 mr-2" />
			Retry Failed
		</Button>
		<Button size="sm" onclick={handleDownload} disabled={$stats.completed === 0}>
			<DownloadOutline class="w-4 h-4 mr-2" />
			Download Completed
		</Button>
	</div>
</div>
