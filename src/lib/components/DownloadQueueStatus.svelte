<script lang="ts">
	import { Badge, Button, ButtonGroup, Progressbar, toast } from 'flowbite-svelte';
	import { downloadQueue } from '$lib/queue';
	import { fitbitApiRateLimit } from '$lib/fitbit-api';
	import { derived, get } from 'svelte/store';
	import { humanizeDuration } from '$lib/utils';
	import { onMount, onDestroy } from 'svelte';

	const queue = derived(downloadQueue, ($q) => $q);

	const status = derived(queue, ($q) => $q?.status);
	const completedTasks = derived(queue, ($q) => $q?.completedTasks);
	const failedTasks = derived(queue, ($q) => $q?.failedTasks);
	const pendingTasks = derived(queue, ($q) => $q?.pendingTasks);
	const totalRuntime = derived(queue, ($q) => $q?.totalRuntime);

	let timeUntilReset = 0;
	let rateLimitResetInterval: NodeJS.Timeout | null = null;

	const rateLimit = derived(fitbitApiRateLimit, ($r) => {
		if (rateLimitResetInterval) clearInterval(rateLimitResetInterval);
		if ($r && $r.reset > 0) {
			timeUntilReset = $r.reset;
			rateLimitResetInterval = setInterval(() => {
				timeUntilReset = Math.max(0, timeUntilReset - 1);
			}, 1000);
		}
		return $r;
	});

	onMount(() => {
		// This forces the derived store to be subscribed to
		const unsubscribe = rateLimit.subscribe(() => {});
		return unsubscribe;
	});

	onDestroy(() => {
		if (rateLimitResetInterval) {
			clearInterval(rateLimitResetInterval);
		}
	});

	function handleErase() {
		if (confirm('Are you sure you want to erase all data and tasks? This cannot be undone.')) {
			get(downloadQueue)?.eraseData();
			toast.success('All data has been erased.');
		}
	}

	function handleRetryFailed() {
		get(downloadQueue)?.retryFailed();
		toast.info('Retrying all failed tasks.');
	}

	function handleDownloadCompleted() {
		get(downloadQueue)?.generateZip();
	}
</script>

<div
	class="my-4 flex flex-col gap-4 rounded-lg border bg-gray-50 p-4 dark:bg-gray-800 md:flex-row md:items-center"
>
	<div class="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2">
		<Badge large>Status: {$status || 'initializing'}</Badge>
		<Badge large color="dark">
			Queue: {$completedTasks || 0}/{$failedTasks || 0}/{$pendingTasks || 0} (C/F/P)
		</Badge>
		<Badge large color="blue">Elapsed: {humanizeDuration($totalRuntime || 0)}</Badge>
		{#if $rateLimit}
			<div class="w-full md:w-auto">
				<Progressbar
					progress={$rateLimit.remaining}
					total={$rateLimit.limit}
					size="h-4"
					labelInside
					class="w-full"
				>
					API: {$rateLimit.remaining}/{$rateLimit.limit} (Resets in {humanizeDuration(
						timeUntilReset * 1000
					)})
				</Progressbar>
			</div>
		{/if}
	</div>
	<div class="flex-none">
		<ButtonGroup>
			<Button onclick={handleErase} color="red">Erase Data</Button>
			<Button onclick={handleRetryFailed} color="yellow" disabled={$failedTasks === 0}>
				Retry Failed
			</Button>
			<Button onclick={handleDownloadCompleted} color="green" disabled={$completedTasks === 0}>
				Download Completed
			</Button>
		</ButtonGroup>
	</div>
</div>