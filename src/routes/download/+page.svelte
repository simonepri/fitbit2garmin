<script lang="ts">
	import { getContext } from 'svelte';
	import type { FitbitAPI } from '$lib/fitbit-api';
	import type { TaskQueue } from '$lib/queue';
	import type { DataType } from '$lib/types';
	import { WeightTask, ActivityTask, TCXTask } from '$lib/tasks';
	import DownloadQueueForm from '$lib/components/DownloadQueueForm.svelte';
	import DownloadQueueStatus from '$lib/components/DownloadQueueStatus.svelte';
	import DownloadQueueTable from '$lib/components/DownloadQueueTable.svelte';
	import { toast } from 'svelte-french-toast';

	const fitbitApi = getContext<FitbitAPI>('fitbitApi');
	const queue = getContext<TaskQueue>('queue');

	const tasks = queue.tasks;

	async function handleAddTask(from: Date, to: Date, types: DataType[]) {
		if (types.length === 0) {
			toast.error('Please select at least one data type.');
			return;
		}

		if (from > to) {
			toast.error('Start date cannot be after end date.');
			return;
		}

		const newTasks = [];
		const monthDiff =
			(to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());

		for (let i = 0; i <= monthDiff; i++) {
			const currentDate = new Date(from.getFullYear(), from.getMonth() + i, 1);
			const year = currentDate.getFullYear();
			const month = currentDate.getMonth() + 1;

			for (const type of types) {
				switch (type) {
					case 'weight':
						newTasks.push(new WeightTask(year, month));
						break;
					case 'activity':
						newTasks.push(new ActivityTask(year, month));
						break;
					case 'tcx':
						newTasks.push(new TCXTask(year, month));
						break;
				}
			}
		}

		const addedCount = await queue.addTasks(newTasks);
		if (addedCount > 0) {
			toast.success(`${addedCount} new tasks added to the queue.`);
		} else {
			toast.error('No new tasks were added. They may already be in the queue.');
		}
	}
</script>

<div class="space-y-6">
	<DownloadQueueForm onAdd={handleAddTask} />
	<DownloadQueueStatus {queue} {fitbitApi} />
	<DownloadQueueTable tasks={$tasks} {queue} />
</div>
