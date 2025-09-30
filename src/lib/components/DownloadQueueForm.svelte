<script lang="ts">
	import { Button, Checkbox, Toast, Alert } from 'flowbite-svelte';
	import { PlusOutline, InfoCircleOutline } from 'flowbite-svelte-icons';
	import MonthYearPicker from './MonthYearPicker.svelte';
	import { queueManager } from '$lib/stores';
	import { TASK_TYPES, type TaskType } from '$lib/tasks';
	import { slide } from 'svelte/transition';

	let startYear = new Date().getFullYear();
	let startMonth = new Date().getMonth(); // Default to last month
	let endYear = new Date().getFullYear();
	let endMonth = new Date().getMonth() + 1; // Default to this month

	if (startMonth === 0) {
		startMonth = 12;
		startYear--;
	}

	let selectedTypes: TaskType[] = [...TASK_TYPES];
	let showSuccessToast = false;
	let showErrorAlert = false;
	let errorMessage = '';
	let addedCount = 0;

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		showErrorAlert = false;
		const startDate = new Date(startYear, startMonth - 1, 1);
		const endDate = new Date(endYear, endMonth - 1, 1);

		if (startDate > endDate) {
			errorMessage = 'Start date cannot be after the end date.';
			showErrorAlert = true;
			return;
		}

		if (selectedTypes.length === 0) {
			errorMessage = 'Please select at least one data type to download.';
			showErrorAlert = true;
			return;
		}

		addedCount = await queueManager.addTasks(startDate, endDate, selectedTypes);
		if (addedCount > 0) {
			showSuccessToast = true;
			setTimeout(() => (showSuccessToast = false), 5000);
		}
	}
</script>

<form
	onsubmit={handleSubmit}
	class="p-4 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 space-y-6"
>
	{#if showErrorAlert}
		<div transition:slide>
			<Alert color="red" dismissable onclose={() => (showErrorAlert = false)}>
				<span slot="icon"><InfoCircleOutline class="w-4 h-4" /></span>
				<span class="font-medium">Error!</span> {errorMessage}
			</Alert>
		</div>
	{/if}

	<!-- Date Pickers -->
	<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
		<MonthYearPicker bind:year={startYear} bind:month={startMonth} label="Start Date" testId="start-date-picker" />
		<MonthYearPicker bind:year={endYear} bind:month={endMonth} label="End Date" testId="end-date-picker" />
	</div>

	<!-- Data Type Checkboxes -->
	<div>
		<h3 class="font-semibold mb-2 text-gray-900 dark:text-white">Data Types</h3>
		<div class="flex flex-wrap gap-4">
			{#each TASK_TYPES as type}
				<Checkbox bind:group={selectedTypes} value={type} class="capitalize">{type}</Checkbox>
			{/each}
		</div>
	</div>

	<!-- Action Button -->
	<div class="flex justify-end">
		<Button type="submit">
			<PlusOutline class="w-5 h-5 mr-2" />
			Add to Download Queue
		</Button>
	</div>
</form>

{#if showSuccessToast}
	<div class="fixed bottom-5 right-5" transition:slide>
		<Toast color="green"
			>Added {addedCount} new task{addedCount > 1 ? 's' : ''} to the queue.</Toast
		>
	</div>
{/if}