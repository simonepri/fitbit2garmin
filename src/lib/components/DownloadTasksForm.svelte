<script lang="ts">
	import MonthYearPicker from './MonthYearPicker.svelte';
	import { downloads } from '$lib/stores/downloads';
    import type { DataType } from '$lib/types';

	let startDate = new Date();
	let endDate = new Date();
	let selectedTypes: DataType[] = ['weight', 'activity', 'tcx'];

	const dataTypes: { id: DataType; label: string }[] = [
		{ id: 'weight', label: 'Weight' },
		{ id: 'activity', label: 'Daily Activity' },
		{ id: 'tcx', label: 'GPS/TCX Tracks' }
	];

	import { toast } from '$lib/stores/toast';

	function handleDateUpdate(event: CustomEvent<{ start: Date; end: Date }>) {
		startDate = event.detail.start;
		endDate = event.detail.end;
	}

	function handleAddToQueue() {
		if (selectedTypes.length === 0) {
			toast.error('Please select at least one data type.');
			return;
		}
		const addedCount = downloads.addTasks(startDate, endDate, selectedTypes);
		if (addedCount > 0) {
			toast.success(`${addedCount} new tasks added to the queue.`);
		} else {
			toast.info('No new tasks were added (they may already exist).');
		}
	}
</script>

<div class="p-4 rounded-lg bg-white shadow-md">
	<div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
		<MonthYearPicker bind:start={startDate} bind:end={endDate} on:update={handleDateUpdate} />
		<fieldset>
			<legend class="block text-sm font-medium text-gray-700 mb-2">Data Types</legend>
			<div class="flex flex-wrap gap-x-6 gap-y-2">
				{#each dataTypes as type}
					<div class="flex items-center">
						<input
							id={type.id}
							type="checkbox"
							bind:group={selectedTypes}
							value={type.id}
							class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
						/>
						<label for={type.id} class="ml-3 block text-sm text-gray-900">
							{type.label}
						</label>
					</div>
				{/each}
			</div>
		</fieldset>
	</div>
	<div class="mt-6 text-right">
		<button
			on:click={handleAddToQueue}
			class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
		>
			Add to Queue
		</button>
	</div>
</div>
