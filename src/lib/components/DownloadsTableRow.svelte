<script lang="ts">
	import type { DownloadTask } from '$lib/types';
	import { downloads } from '$lib/stores/downloads';
    import TaskTimer from './TaskTimer.svelte';
    import { ratelimit } from '$lib/client/api';
    import { onMount } from 'svelte';

	export let task: DownloadTask;

    let timeUntilStart = '';
    let interval: any;

	const statusColors = {
		pending: 'bg-gray-200 text-gray-800',
		downloading: 'bg-blue-200 text-blue-800 animate-pulse',
		completed: 'bg-green-200 text-green-800',
		failed: 'bg-red-200 text-red-800',
        waiting: 'bg-yellow-200 text-yellow-800'
	};

    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const taskDate = `${monthNames[task.month - 1]} ${task.year}`;

    function handleRetry() {
        downloads.retryTask(task.id);
    }

    function formatDuration(ms: number): string {
        if (ms <= 0) return '0s';
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const parts = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
        return parts.join(' ');
    }

    function updateTimer() {
        if (task.status === 'waiting') {
            const diff = $ratelimit.resetAt - Date.now();
            timeUntilStart = `in ${formatDuration(diff)}`;
        } else {
            timeUntilStart = '';
        }
    }

    onMount(() => {
        if (task.status === 'waiting') {
            interval = setInterval(updateTimer, 1000);
        }
        return () => clearInterval(interval);
    });

    $: if (task.status !== 'waiting' && interval) {
        clearInterval(interval);
        timeUntilStart = '';
    } else if (task.status === 'waiting' && !interval) {
        interval = setInterval(updateTimer, 1000);
    }
    $: task.status, updateTimer();

</script>

<tr data-testid="task-row-{task.id}">
	<td class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
		{task.type.toUpperCase()}
	</td>
	<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{taskDate}</td>
	<td class="whitespace-nowrap px-3 py-4 text-sm">
		<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full {statusColors[task.status]}">
			{task.status} {timeUntilStart}
		</span>
	</td>
	<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
        {#if task.status === 'downloading' || task.status === 'completed' || task.status === 'failed'}
            <span>{task.completedFiles} / {task.totalFiles}</span>

            {@const details = []}
            {#if task.failedFiles > 0}
                {@const _ = details.push(`${task.failedFiles} failed`)}
            {/if}
            {#if task.emptyFiles > 0}
                {@const _ = details.push(`${task.emptyFiles} empty`)}
            {/if}

            {#if details.length > 0}
                <span class="text-gray-500 ml-2">({details.join(', ')})</span>
            {/if}
        {:else}
            -
        {/if}
    </td>
    <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
        <TaskTimer {task} />
    </td>
	<td class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
		{#if task.status === 'failed' || task.status === 'completed'}
			<button on:click={handleRetry} class="text-indigo-600 hover:text-indigo-900 cursor-pointer">
                {task.status === 'failed' ? 'Retry' : 'Refresh'}
            </button>
		{/if}
	</td>
</tr>
