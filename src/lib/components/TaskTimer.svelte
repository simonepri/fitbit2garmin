<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import type { DownloadTask } from '$lib/types';
    import { formatDuration } from '$lib/utils';

    export let task: DownloadTask;

    let displayTime = '0.0s';
    let interval: any;

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