<script lang="ts">
	import { Button, Checkbox, Label } from 'flowbite-svelte';
	import { PlusOutline } from 'flowbite-svelte-icons';
	import MonthYearPicker from './MonthYearPicker.svelte';
	import { DownloadQueue } from '$lib/queue';
	import { DataType } from '$lib/tasks';

	let { queue } = $props<{ queue: DownloadQueue }>();

	const now = new Date();
	let startMonth = $state(1);
	let startYear = $state(now.getFullYear());
	let endMonth = $state(now.getMonth() + 1);
	let endYear = $state(now.getFullYear());

	let selectedDataTypes = $state<DataType[]>([]);
	const availableDataTypes = DownloadQueue.getAvailableDataTypes();

	async function handleAddToQueue() {
		if (selectedDataTypes.length === 0) {
			alert('Please select at least one data type.');
			return;
		}
		const newTasksCount = await queue.addTasks(
			startYear,
			startMonth,
			endYear,
			endMonth,
			selectedDataTypes
		);
		// In a real app, we would use a toast notification library here.
		alert(`${newTasksCount} new tasks added to the queue.`);
	}
</script>

<form
	onsubmit={handleAddToQueue}
	class="md:flex-row md:items-end gap-4 p-4 border-gray-200 rounded-lg dark:border-gray-700 flex flex-col border"
>
	<div class="sm:flex-row gap-4 flex flex-col">
		<div>
			<Label class="mb-2 block">Start Date</Label>
			<MonthYearPicker
				bind:selectedMonth={startMonth}
				bind:selectedYear={startYear}
				idPrefix="start"
			/>
		</div>
		<div>
			<Label class="mb-2 block">End Date</Label>
			<MonthYearPicker bind:selectedMonth={endMonth} bind:selectedYear={endYear} idPrefix="end" />
		</div>
	</div>

	<div class="flex-grow">
		<Label class="mb-2 block">Data Types</Label>
		<div class="gap-4 flex flex-wrap">
			{#each availableDataTypes as dataType (dataType)}
				<Checkbox bind:group={selectedDataTypes} value={dataType}>
					{dataType.charAt(0).toUpperCase() + dataType.slice(1)}
				</Checkbox>
			{/each}
		</div>
	</div>

	<div class="mt-4 md:mt-0">
		<Button type="submit">
			<PlusOutline class="w-5 h-5 mr-2" />
			Add to Queue
		</Button>
	</div>
</form>
