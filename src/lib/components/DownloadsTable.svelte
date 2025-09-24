<script lang="ts">
	import { downloads } from '$lib/stores/downloads';
	import DownloadsTableRow from './DownloadsTableRow.svelte';
</script>

<div class="mt-8 flow-root">
	<div class="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
		<div class="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            {#if $downloads.length > 0}
			<table class="min-w-full divide-y divide-gray-300">
				<thead>
					<tr>
						<th
							scope="col"
							class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0"
						>
							Data Type
						</th>
						<th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
							Date
						</th>
						<th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
							Status
						</th>
						<th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
							Progress
						</th>
						<th scope="col" class="relative py-3.5 pl-3 pr-4 sm:pr-0">
							<span class="sr-only">Actions</span>
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					{#each $downloads as task (task.id)}
						<DownloadsTableRow {task} />
					{/each}
				</tbody>
			</table>
            {:else}
            <div class="text-center py-8 text-gray-500">
                <p>No download tasks yet.</p>
                <p>Use the form above to add tasks to the queue.</p>
            </div>
            {/if}
		</div>
	</div>
</div>
