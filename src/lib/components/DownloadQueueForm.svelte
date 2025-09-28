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

	const now = new Date();
	let endYear = now.getFullYear();
	let endMonth = now.getMonth() + 1;
	now.setMonth(now.getMonth() - 1);
	let startYear = now.getFullYear();
	let startMonth = now.getMonth() + 1;
	let selectedTypes: TaskType[] = [];

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

<div class="md:flex-row gap-4 flex flex-col items-center">
	<div class="sm:flex-row gap-4 flex flex-col">
		<MonthYearPicker bind:year={startYear} bind:month={startMonth} labelPrefix="Start" />
		<MonthYearPicker bind:year={endYear} bind:month={endMonth} labelPrefix="End" />
	</div>
	<div class="gap-4 flex flex-wrap">
		{#each availableTaskTypes as type (type)}
			<Checkbox bind:group={selectedTypes} value={type}
				>{type.charAt(0).toUpperCase() + type.slice(1)}</Checkbox
			>
		{/each}
	</div>
	<Button onclick={handleAdd}>Add to Download Queue</Button>
</div>