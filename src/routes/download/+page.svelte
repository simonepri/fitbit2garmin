<script lang="ts">
	import { onMount } from 'svelte';
	import { FitbitApi } from '$lib/fitbit-api';
	import { DownloadQueue, type QueueState } from '$lib/queue';
	import DownloadQueueForm from '$lib/components/DownloadQueueForm.svelte';
	import DownloadQueueStatus from '$lib/components/DownloadQueueStatus.svelte';
	import DownloadQueueTable from '$lib/components/DownloadQueueTable.svelte';
	import { Button, Modal, Toast } from 'flowbite-svelte';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import type { TaskType } from '$lib/tasks';

	let fitbitApi: FitbitApi;
	let queue: DownloadQueue;
	let queueState: QueueState;
	let showLogoutModal = false;
	let showToast = false;
	let toastMessage = '';

	onMount(() => {
		fitbitApi = new FitbitApi();
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

	function handleLogout() {
		if (fitbitApi) {
			fitbitApi.logout();
		}
		if (queue) {
			queue.eraseData();
		}
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto('/');
	}
</script>

<div class="p-4">
	<h1 class="text-2xl font-bold mb-4">Download Dashboard</h1>
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
		<Button class="mt-4" onclick={() => (showLogoutModal = true)}>Logout</Button>
	{:else}
		<p>Initializing...</p>
	{/if}
</div>

<Modal bind:open={showLogoutModal} title="Confirm Logout">
	<p>Are you sure you want to log out? All your queued and downloaded data will be erased.</p>
	<div class="gap-2 mt-4 flex justify-end">
		<Button color="red" onclick={handleLogout}>Logout</Button>
		<Button color="gray" onclick={() => (showLogoutModal = false)}>Cancel</Button>
	</div>
</Modal>

{#if showToast}
	<Toast>{toastMessage}</Toast>
{/if}