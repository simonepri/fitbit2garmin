<script lang="ts">
	import type { DownloadTask } from '$lib/types';
	import { downloads } from '$lib/stores/downloads';

	export let task: DownloadTask;

	const statusColors = {
		pending: 'bg-gray-200 text-gray-800',
		downloading: 'bg-blue-200 text-blue-800 animate-pulse',
		completed: 'bg-green-200 text-green-800',
		failed: 'bg-red-200 text-red-800'
	};

    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const taskDate = `${monthNames[task.month - 1]} ${task.year}`;

    function handleRetry() {
        downloads.retryTask(task.id);
    }
</script>

<tr data-testid="task-row-{task.id}">
	<td class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
		{task.type.toUpperCase()}
	</td>
	<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{taskDate}</td>
	<td class="whitespace-nowrap px-3 py-4 text-sm">
		<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full {statusColors[task.status]}">
			{task.status}
		</span>
	</td>
	<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
        {#if task.status === 'downloading' || task.status === 'completed' || task.status === 'failed'}
            <span>{task.completedFiles} / {task.totalFiles} completed</span>
            {#if task.failedFiles > 0}
                <span class="text-red-500 ml-2">({task.failedFiles} failed)</span>
            {/if}
        {:else}
            -
        {/if}
    </td>
	<td class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
		{#if task.status === 'failed' || task.status === 'completed'}
			<button on:click={handleRetry} class="text-indigo-600 hover:text-indigo-900">
                {task.status === 'failed' ? 'Retry' : 'Refresh'}
            </button>
		{/if}
	</td>
</tr>
