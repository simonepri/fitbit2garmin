<script lang="ts">
	import { Label, Select } from 'flowbite-svelte';

	let {
		selectedMonth = $bindable(),
		selectedYear = $bindable(),
		idPrefix = 'month-year'
	} = $props<{
		selectedMonth: number;
		selectedYear: number;
		idPrefix?: string;
	}>();

	const months = [
		{ value: 1, name: 'January' },
		{ value: 2, name: 'February' },
		{ value: 3, name: 'March' },
		{ value: 4, name: 'April' },
		{ value: 5, name: 'May' },
		{ value: 6, name: 'June' },
		{ value: 7, name: 'July' },
		{ value: 8, name: 'August' },
		{ value: 9, name: 'September' },
		{ value: 10, name: 'October' },
		{ value: 11, name: 'November' },
		{ value: 12, name: 'December' }
	];

	const currentYear = new Date().getFullYear();
	const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
</script>

<div class="sm:flex-row gap-2 flex flex-col">
	<div>
		<Label for="{idPrefix}-month" class="sr-only">Month</Label>
		<Select id="{idPrefix}-month" bind:value={selectedMonth}>
			{#each months as month (month.value)}
				<option value={month.value}>{month.name}</option>
			{/each}
		</Select>
	</div>
	<div>
		<Label for="{idPrefix}-year" class="sr-only">Year</Label>
		<Select id="{idPrefix}-year" bind:value={selectedYear}>
			{#each years as year (year)}
				<option value={year}>{year}</option>
			{/each}
		</Select>
	</div>
</div>
