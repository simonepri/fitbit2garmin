<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { DownloadQueue, type QueueState } from '$lib/queue';
	import DownloadQueueForm from '$lib/components/DownloadQueueForm.svelte';
	import DownloadQueueStatus from '$lib/components/DownloadQueueStatus.svelte';
	import DownloadQueueTable from '$lib/components/DownloadQueueTable.svelte';
	import { Toast } from 'flowbite-svelte';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import type { TaskType } from '$lib/tasks';
	import { keys } from '$lib/keys';
	import type { FitbitApi } from '$lib/fitbit-api';

	const fitbitApi = getContext<FitbitApi>(keys.fitbitApi);

	let queue: DownloadQueue;
	let queueState: QueueState;
	let showToast = false;
	let toastMessage = '';

	onMount(() => {
		const authState = get(fitbitApi.authState);

		if (!authState.accessToken) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			goto('/');
			return;
		}

		queue = new DownloadQueue(fitbitApi);
		queue.tasks.subscribe((value) => {
			queueState = value;
		});
	});

	function handleAddTask(
		start: { year: number; month: number },
		end: { year: number; month: number },
		types: TaskType[]
	) {
		if (queue) {
			const addedCount = queue.addTasks(start, end, types);
			toastMessage = `${addedCount} new tasks added to the queue.`;
			showToast = true;
			setTimeout(() => {
				showToast = false;
			}, 3000);
		}
	}

	async function handleDownloadCompleted() {
		if (queue) {
			const blob = await queue.generateZip();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'fitbit_export.zip';
			a.click();
			URL.revokeObjectURL(url);
		}
	}
</script>

<div class="p-4">
	<h1 class="mb-4 text-2xl font-bold">Download Dashboard</h1>
	{#if queue}
		<div class="space-y-4">
			<DownloadQueueForm onAddTask={handleAddTask} />
			<DownloadQueueStatus
				bind:queueStatus={queueState.status}
				bind:tasks={queueState.tasks}
				{fitbitApi}
				onErase={() => queue.eraseData()}
				onRetryFailed={() => queue.retryFailed()}
				onDownloadCompleted={handleDownloadCompleted}
			/>
			{#if queueState.tasks.length > 0}
				<DownloadQueueTable
					tasks={queueState.tasks}
					onRetry={(taskId) => queue.retryTask(taskId)}
				/>
			{/if}
		</div>
	{:else}
		<p>Initializing...</p>
	{/if}
</div>

{#if showToast}
	<Toast>{toastMessage}</Toast>
{/if}
