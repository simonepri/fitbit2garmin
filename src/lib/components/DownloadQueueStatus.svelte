<script lang="ts">
	import { Button, Spinner } from 'flowbite-svelte';
	import {
		DownloadOutline,
		RefreshOutline,
		TrashBinOutline
	} from 'flowbite-svelte-icons';
	import { queueManager, fitbitApi } from '$lib/stores';
	import { onMount, onDestroy } from 'svelte';

	const { status$, statistics$, generateZip, retryFailed, clearAllData } = queueManager;
	const { rateLimit } = fitbitApi;

	let timeUntilReset = '';
	let interval: any;

	function formatDuration(ms: number): string {
		if (ms < 1000) return '0s';
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}m ${seconds}s`;
	}

	function updateResetTimer() {
		const resetTime = $rateLimit.reset;
		const now = Date.now();
		const diff = Math.max(0, resetTime - now);
		timeUntilReset = formatDuration(diff);
	}

	onMount(() => {
		updateResetTimer();
		interval = setInterval(updateResetTimer, 1000);
	});

	onDestroy(() => {
		clearInterval(interval);
	});

	async function handleDownload() {
		const zipBlob = await generateZip();
		const url = URL.createObjectURL(zipBlob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `fitbit-export-${new Date().toISOString().split('T')[0]}.zip`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
</script>

<div
	class="p-4 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
>
	<div class="flex flex-wrap items-center justify-between gap-4">
		<!-- Status Info -->
		<div class="flex-grow text-sm text-gray-700 dark:text-gray-300">
			<div class="flex flex-wrap gap-x-4 gap-y-1">
				<span>
					<strong>Status:</strong>
					<span class="capitalize">{$status$}</span>
					{#if $status$ === 'running'}
						<Spinner size="4" class="ml-2" />
					{/if}
				</span>
				<span>
					<strong>Tasks:</strong>
					{$statistics$.completed}/{$statistics$.failed}/{$statistics$.pending}
					<span class="text-xs text-gray-500">(C/F/P)</span>
				</span>
				<span>
					<strong>Elapsed:</strong>
					{formatDuration($statistics$.totalRuntime)}
				</span>
				<span>
					<strong>API Quota:</strong>
					{$rateLimit.remaining}/{$rateLimit.limit}
					(Resets in {timeUntilReset})
				</span>
			</div>
		</div>

		<!-- Action Buttons -->
		<div class="flex-shrink-0 flex items-center gap-2">
			<Button
				size="sm"
				onclick={handleDownload}
				disabled={$statistics$.completed === 0}
			>
				<DownloadOutline class="w-5 h-5 mr-2" />
				Download Completed
			</Button>
			<Button
				size="sm"
				onclick={retryFailed}
				disabled={$statistics$.failed === 0 || $status$ === 'running'}
			>
				<RefreshOutline class="w-5 h-5 mr-2" />
				Retry Failed
			</Button>
			<Button
				size="sm"
				color="red"
				onclick={clearAllData}
				disabled={$status$ === 'running'}
			>
				<TrashBinOutline class="w-5 h-5 mr-2" />
				Erase Data
			</Button>
		</div>
	</div>
</div>