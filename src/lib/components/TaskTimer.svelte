<script lang="ts">
    import { onMount } from 'svelte';
    import type { DownloadTask } from '$lib/types';

    export let task: DownloadTask;

    let displayTime = 'N/A';
    let interval: any;

    function formatDuration(ms: number): string {
        if (ms <= 0) return '0.0s';
        return `${(ms / 1000).toFixed(1)}s`;
    }

    function updateDisplayTime() {
        if (task.status === 'downloading' && task.startTime) {
            displayTime = formatDuration(Date.now() - task.startTime);
        } else if ((task.status === 'completed' || task.status === 'failed') && task.startTime && task.endTime) {
            displayTime = formatDuration(task.endTime - task.startTime);
            if (interval) clearInterval(interval);
        } else {
            displayTime = 'N/A';
            if (interval) clearInterval(interval);
        }
    }

    onMount(() => {
        if (task.status === 'downloading') {
            interval = setInterval(updateDisplayTime, 100);
        }
        return () => clearInterval(interval);
    });

    $: task.status, updateDisplayTime();
</script>

<span>{displayTime}</span>