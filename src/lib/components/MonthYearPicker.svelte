<script lang="ts">
	import { Label, Select } from 'flowbite-svelte';

	export let year: number;
	export let month: number;
	export let label: string;
	export let testId: string | undefined = undefined;

	const currentYear = new Date().getFullYear();
	const years = Array.from({ length: currentYear - 2007 }, (_, i) => currentYear - i);

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

<div class="flex flex-col space-y-2" data-testid={testId}>
	<Label>{label}</Label>
	<div class="flex gap-2">
		<Select bind:value={month} class="w-full" placeholder="Select month">
			{#each months as { value, name }}
				<option {value}>{name}</option>
			{/each}
		</Select>
		<Select bind:value={year} class="w-full" placeholder="Select year">
			{#each years as y}
				<option value={y}>{y}</option>
			{/each}
		</Select>
	</div>
</div>