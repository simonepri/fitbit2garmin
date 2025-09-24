<script lang="ts">
    import { stats } from '$lib/stores/stats';
    import { ratelimit } from '$lib/stores/ratelimit';
    import { queueStartTime } from '$lib/stores/downloads';
    import { onMount } from 'svelte';

    let timeUntilReset = '';
    let liveElapsed = '0s';
    let interval: any;

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
        if ($queueStartTime && $stats.status !== 'FINISHED') {
            liveElapsed = formatDuration(Date.now() - $queueStartTime);
        } else {
            liveElapsed = $stats.elapsed;
        }
    }

    onMount(() => {
        interval = setInterval(updateTimers, 1000);
        return () => clearInterval(interval);
    });

    $: if ($ratelimit || $stats || $queueStartTime) {
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
    <div class="flex justify-around items-center">
        <div>
            <strong>Status:</strong>
            <span class="font-mono ml-1">{statusText[$stats.status]} {timeUntilReset}</span>
        </div>
        <div class="border-l border-gray-400 h-6 mx-4"></div>
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
            <strong>Time:</strong>
            <span class="font-mono ml-1">
                Elapsed: {liveElapsed} ({$stats.remaining || 'N/A'} remaining)
            </span>
        </div>
    </div>
</div>
