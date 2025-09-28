<script lang="ts">
	import { Select } from 'flowbite-svelte';

	export let year: number;
	export let month: number;
	export let labelPrefix: string = '';

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

<div class="gap-2 flex">
	<Select bind:value={month} items={months} aria-label="{labelPrefix} Month" />
	<Select
		bind:value={year}
		items={years.map((y) => ({ value: y, name: y.toString() }))}
		aria-label="{labelPrefix} Year"
	/>
</div>
