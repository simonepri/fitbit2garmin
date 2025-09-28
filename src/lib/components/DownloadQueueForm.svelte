<script lang="ts">
	import { Button, Checkbox } from 'flowbite-svelte';
	import MonthYearPicker from './MonthYearPicker.svelte';
	import { availableTaskTypes } from '$lib/queue';
	import type { TaskType } from '$lib/tasks';

	export let onAddTask: (
		start: { year: number; month: number },
		end: { year: number; month: number },
		types: TaskType[]
	) => void;

	let startYear: number;
	let startMonth: number;
	let endYear: number;
	let endMonth: number;
	let selectedTypes: TaskType[] = [];

	// Initialize dates without top-level mutation
	const today = new Date();
	endYear = today.getFullYear();
	endMonth = today.getMonth() + 1; // getMonth is 0-indexed

	const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, 1);
	startYear = oneMonthAgo.getFullYear();
	startMonth = oneMonthAgo.getMonth() + 1;

	function handleAdd() {
		if (selectedTypes.length > 0) {
			onAddTask(
				{ year: startYear, month: startMonth },
				{ year: endYear, month: endMonth },
				selectedTypes
			);
		}
	}
</script>

<div class="gap-4 md:flex-row flex flex-col items-center">
	<div class="gap-4 sm:flex-row flex flex-col">
		<MonthYearPicker bind:year={startYear} bind:month={startMonth} labelPrefix="Start" />
		<MonthYearPicker bind:year={endYear} bind:month={endMonth} labelPrefix="End" />
	</div>
	<div class="gap-4 flex flex-wrap">
		{#each availableTaskTypes as type (type)}
			<Checkbox bind:group={selectedTypes} value={type}>
				{type.charAt(0).toUpperCase() + type.slice(1)}
			</Checkbox>
		{/each}
	</div>
	<Button onclick={handleAdd}>Add to Download Queue</Button>
</div>
