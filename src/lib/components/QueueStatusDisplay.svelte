<script lang="ts">
    import { stats, formatDuration } from '$lib/stores/stats';
    import { ratelimit } from '$lib/client/api';
    import { downloads } from '$lib/stores/downloads';
    import { onMount } from 'svelte';

    let timeUntilReset = '';
    let liveElapsed = $stats.elapsed;
    let interval: any;

    function updateTimers() {
        // Update "resumes in" timer
        if ($stats.status === 'PAUSED') {
            const now = Date.now();
            const resetAt = $ratelimit.resetAt;
            const diff = resetAt - now;
            timeUntilReset = diff > 0 ? `(resumes in ~${formatDuration(diff)})` : '';
        } else {
            timeUntilReset = '';
        }

        // Update live elapsed timer
        if ($stats.status === 'DOWNLOADING' || $stats.status === 'PAUSED') {
            // This is a bit of a hack, but it works. We find the running task and add its live runtime to the total.
            const runningTask = $downloads.find(t => t.status === 'downloading');
            const totalFinishedTime = $downloads
                .filter(t => t.status !== 'downloading')
                .reduce((acc, t) => acc + t.activeTime, 0);

            const runningTime = runningTask && runningTask.lastStartTime
                ? Date.now() - runningTask.lastStartTime
                : 0;

            liveElapsed = formatDuration(totalFinishedTime + runningTime);

        } else {
            liveElapsed = $stats.elapsed;
        }
    }

    onMount(() => {
        interval = setInterval(updateTimers, 1000);
        return () => clearInterval(interval);
    });

    $: if ($ratelimit || $stats) {
        updateTimers();
    }

    const statusText = {
        IDLE: 'Idle',
        DOWNLOADING: 'Downloading...',
        PAUSED: 'Paused (Quota)',
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
            <span class="font-mono ml-1">{$ratelimit.remaining} / {$ratelimit.limit} {timeUntilReset}</span>
        </div>
    </div>
</div>
