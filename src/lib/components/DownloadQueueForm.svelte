<script lang="ts">
	import { Button, Checkbox, Label, toast } from 'flowbite-svelte';
	import MonthYearPicker from './MonthYearPicker.svelte';
	import { downloadQueue, availableTaskTypes, type TaskType } from '$lib/queue';
	import { get } from 'svelte/store';

	let startMonth = new Date().getMonth() + 1;
	let startYear = new Date().getFullYear();
	let endMonth = new Date().getMonth() + 1;
	let endYear = new Date().getFullYear();
	let selectedTypes: TaskType[] = [];

	function handleAddToQueue() {
		if (selectedTypes.length === 0) {
			toast.danger('Please select at least one data type.');
			return;
		}

		const startDate = new Date(startYear, startMonth - 1, 1);
		const endDate = new Date(endYear, endMonth - 1, 1);

		if (startDate > endDate) {
			toast.danger('Start date cannot be after end date.');
			return;
		}

		const queue = get(downloadQueue);
		if (queue) {
			const newTasksCount = queue.addTasks(startDate, endDate, selectedTypes);
			if (newTasksCount > 0) {
				toast.success(`${newTasksCount} new tasks added to the queue.`);
			} else {
				toast.info('No new tasks were added. The selected tasks are already in the queue.');
			}
		}
	}
</script>

<div
	class="gap-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800 md:flex-row md:items-end flex flex-col border"
>
	<div class="flex-1">
		<Label class="mb-2 block">Date Range</Label>
		<div class="gap-4 sm:flex-row flex flex-col">
			<MonthYearPicker bind:selectedMonth={startMonth} bind:selectedYear={startYear} />
			<div class="text-gray-500 flex items-center justify-center">-</div>
			<MonthYearPicker bind:selectedMonth={endMonth} bind:selectedYear={endYear} />
		</div>
	</div>

	<div class="flex-1">
		<Label class="mb-2 block">Data Types</Label>
		<div class="gap-4 flex flex-wrap">
			{#each availableTaskTypes as type (type)}
				<Checkbox bind:group={selectedTypes} value={type}>
					{type.charAt(0).toUpperCase() + type.slice(1)}
				</Checkbox>
			{/each}
		</div>
	</div>

	<div class="md:ml-auto">
		<Button onclick={handleAddToQueue}>Add to Download Queue</Button>
	</div>
</div>
