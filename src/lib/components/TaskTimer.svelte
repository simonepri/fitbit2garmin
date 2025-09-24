<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import type { DownloadTask } from '$lib/types';

    export let task: DownloadTask;

    let displayTime = '0.0s';
    let interval: any;

    function formatDuration(ms: number): string {
        if (ms <= 0) return '0.0s';
        return `${(ms / 1000).toFixed(1)}s`;
    }

    function updateDisplayTime() {
        if (task.status === 'downloading' && task.lastStartTime) {
            const elapsed = task.activeTime + (Date.now() - task.lastStartTime);
            displayTime = formatDuration(elapsed);
        } else if (task.activeTime > 0) {
            displayTime = formatDuration(task.activeTime);
        } else {
            displayTime = '0.0s';
        }
    }

    function startTimer() {
        if (task.status === 'downloading' && !interval) {
            interval = setInterval(updateDisplayTime, 100);
        }
    }

    function stopTimer() {
        if (interval) {
            clearInterval(interval);
            interval = null;
        }
    }

    onMount(() => {
        startTimer();
    });

    onDestroy(() => {
        stopTimer();
    });

    $: if (task.status !== 'downloading') {
        stopTimer();
    } else {
        startTimer();
    }
    $: task.status, task.activeTime, task.lastStartTime, updateDisplayTime();

</script>

<span>{displayTime}</span>