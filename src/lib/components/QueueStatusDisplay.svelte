<script lang="ts">
    import { stats } from '$lib/stores/stats';
    import { ratelimit } from '$lib/stores/ratelimit';
    import { onMount } from 'svelte';

    let timeUntilReset = '';
    let interval: any;

    function updateRemainingTime() {
        if ($stats.status !== 'PAUSED') return;

        const now = Date.now();
        const resetAt = $ratelimit.resetAt;
        if (now > resetAt) {
            timeUntilReset = '';
            return;
        }

        const diffSeconds = Math.floor((resetAt - now) / 1000);
        const hours = Math.floor(diffSeconds / 3600);
        const minutes = Math.floor((diffSeconds % 3600) / 60);
        const seconds = diffSeconds % 60;

        let parts = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

        timeUntilReset = `(resumes in ~${parts.join(' ')})`;
    }

    onMount(() => {
        updateRemainingTime();
        interval = setInterval(updateRemainingTime, 1000);
        return () => clearInterval(interval);
    });

    $: if ($ratelimit || $stats) {
        updateRemainingTime();
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
                Elapsed: {$stats.elapsed} ({$stats.remaining || 'N/A'} remaining)
            </span>
        </div>
    </div>
</div>
