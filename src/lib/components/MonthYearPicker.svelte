<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let start: Date;
	export let end: Date;

	const dispatch = createEventDispatcher();

	const currentYear = new Date().getFullYear();
	const years = Array.from({ length: 15 }, (_, i) => currentYear - i);
	const months = [
		{ value: 0, name: 'January' },
		{ value: 1, name: 'February' },
		{ value: 2, name: 'March' },
		{ value: 3, name: 'April' },
		{ value: 4, name: 'May' },
		{ value: 5, name: 'June' },
		{ value: 6, name: 'July' },
		{ value: 7, name: 'August' },
		{ value: 8, name: 'September' },
		{ value: 9, name: 'October' },
		{ value: 10, name: 'November' },
		{ value: 11, name: 'December' }
	];

	let startMonth = start.getMonth();
	let startYear = start.getFullYear();
	let endMonth = end.getMonth();
	let endYear = end.getFullYear();

	function updateDates() {
		const newStart = new Date(startYear, startMonth, 1);
		const newEnd = new Date(endYear, endMonth, 1);

        if (newStart > newEnd) {
            // If start is after end, sync them
            if (this === 'start') {
                endYear = startYear;
                endMonth = startMonth;
            } else {
                startYear = endYear;
                startMonth = endMonth;
            }
        }

		dispatch('update', { start: new Date(startYear, startMonth, 1), end: new Date(endYear, endMonth, 1) });
	}
</script>

<div class="flex flex-col md:flex-row md:items-center md:space-x-4 space-y-4 md:space-y-0">
	<div>
		<label for="start-month" class="block text-sm font-medium text-gray-700">Start Date</label>
		<div class="flex space-x-2">
			<select id="start-month" bind:value={startMonth} on:change={() => updateDates.call('start')} class="mt-1 block w-36 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
				{#each months as month}
					<option value={month.value}>{month.name}</option>
				{/each}
			</select>
			<select bind:value={startYear} on:change={() => updateDates.call('start')} class="mt-1 block w-28 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
				{#each years as year}
					<option value={year}>{year}</option>
				{/each}
			</select>
		</div>
	</div>
	<div>
		<label for="end-month" class="block text-sm font-medium text-gray-700">End Date</label>
		<div class="flex space-x-2">
			<select id="end-month" bind:value={endMonth} on:change={() => updateDates.call('end')} class="mt-1 block w-36 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
				{#each months as month}
					<option value={month.value}>{month.name}</option>
				{/each}
			</select>
			<select bind:value={endYear} on:change={() => updateDates.call('end')} class="mt-1 block w-28 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
				{#each years as year}
					<option value={year}>{year}</option>
				{/each}
			</select>
		</div>
	</div>
</div>
