<script lang="ts">
    import { stats, downloads } from '$lib/stores/downloads';
    import { ratelimit } from '$lib/client/api';
    import { formatDuration } from '$lib/utils';
    import { onMount } from 'svelte';

    let liveElapsed = formatDuration($stats.elapsed);
    let interval: any;

    function updateTimers() {
        if ($stats.status === 'DOWNLOADING') {
            const runningTask = $downloads.find(t => t.status === 'downloading');
            const runningTime = runningTask && runningTask.lastStartTime ? Date.now() - runningTask.lastStartTime : 0;
            liveElapsed = formatDuration($stats.elapsed + runningTime);
        } else {
            liveElapsed = formatDuration($stats.elapsed);
        }
    }

    onMount(() => {
        interval = setInterval(updateTimers, 1000);
        return () => clearInterval(interval);
    });

    $: if ($stats) {
        updateTimers();
    }

    const statusText = {
        IDLE: 'Idle',
        DOWNLOADING: 'Downloading...',
        FINISHED: 'Finished'
    }

</script>

<div class="p-2 bg-gray-200 text-gray-700 rounded-md text-sm">
    <div class="flex flex-wrap justify-around items-center gap-x-4 gap-y-1">
        <div>
            <strong>Status:</strong>
            <span class="font-mono ml-1">{statusText[$stats.status]}</span>
        </div>
        <div class="border-l border-gray-400 h-6 mx-4 hidden sm:block"></div>
        <div>
            <strong>Queue:</strong>
            <span class="font-mono ml-1">
                <span class="text-green-600">{$stats.completed}</span> /
                <span class="text-red-600">{$stats.failed}</span> /
                <span class="text-blue-600">{$stats.pending}</span>
                (C/F/P)
            </span>
        </div>
        <div class="border-l border-gray-400 h-6 mx-4"></div>
        <div>
            <strong>Elapsed:</strong>
            <span class="font-mono ml-1">{liveElapsed}</span>
        </div>
        <div class="border-l border-gray-400 h-6 mx-4 hidden sm:block"></div>
        <div>
            <strong>API Quota:</strong>
            <span class="font-mono ml-1">{$ratelimit.remaining} / {$ratelimit.limit}</span>
        </div>
    </div>
</div>
