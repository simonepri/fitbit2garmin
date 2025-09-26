<script lang="ts">
	import { Button, Checkbox, Label } from 'flowbite-svelte';
	import MonthYearPicker from './MonthYearPicker.svelte';
	import type { DataType } from '$lib/types';

	export let onAdd: (from: Date, to: Date, types: DataType[]) => void;

	const dataTypes: { value: DataType; name: string }[] = [
		{ value: 'weight', name: 'Weight' },
		{ value: 'activity', name: 'Activity' },
		{ value: 'tcx', name: 'TCX' }
	];

	let startYear = new Date().getFullYear();
	let startMonth = new Date().getMonth() + 1;
	let endYear = new Date().getFullYear();
	let endMonth = new Date().getMonth() + 1;
	let selectedTypes: DataType[] = [];

	function handleAdd() {
		const fromDate = new Date(startYear, startMonth - 1, 1);
		const toDate = new Date(endYear, endMonth, 0); // Last day of end month
		onAdd(fromDate, toDate, selectedTypes);
	}
</script>

<div
	class="md:flex-row md:items-center md:justify-between gap-4 p-4 rounded-lg flex flex-col border"
>
	<div class="sm:flex-row sm:items-center gap-4 flex flex-col">
		<div class="gap-2 flex items-center">
			<Label for="start-date">From:</Label>
			<MonthYearPicker id="start-date" bind:year={startYear} bind:month={startMonth} />
		</div>
		<div class="gap-2 flex items-center">
			<Label for="end-date">To:</Label>
			<MonthYearPicker id="end-date" bind:year={endYear} bind:month={endMonth} />
		</div>
	</div>

	<div class="gap-4 flex items-center">
		{#each dataTypes as { value, name } (value)}
			<Checkbox bind:group={selectedTypes} {value}>{name}</Checkbox>
		{/each}
	</div>

	<Button onclick={handleAdd} disabled={selectedTypes.length === 0}>Add to Download Queue</Button>
</div>
