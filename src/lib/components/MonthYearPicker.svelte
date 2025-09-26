<script lang="ts">
	import { Label, Select } from 'flowbite-svelte';

	export let year: number;
	export let month: number;
	export let id: string;

	const currentYear = new Date().getFullYear();
	const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
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
</script>

<div class="gap-2 flex items-center">
	<Label for="{id}-month" class="sr-only">Month</Label>
	<Select id="{id}-month" bind:value={month} class="w-40">
		{#each months as { value, name } (value)}
			<option {value}>{name}</option>
		{/each}
	</Select>

	<Label for="{id}-year" class="sr-only">Year</Label>
	<Select id="{id}-year" bind:value={year} class="w-28">
		{#each years as y (y)}
			<option value={y}>{y}</option>
		{/each}
	</Select>
</div>
