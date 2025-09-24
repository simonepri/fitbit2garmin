<script lang="ts">
    import { ratelimit } from '$lib/stores/ratelimit';
    import { onMount } from 'svelte';

    let remainingTime = '';
    let interval: any;

    function updateRemainingTime() {
        const now = Date.now();
        const resetAt = $ratelimit.resetAt;
        if (now > resetAt) {
            remainingTime = 'Quota has reset.';
            // The remaining count will update on the next API call.
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

        remainingTime = `resets in ${parts.join(' ')}`;
    }

    onMount(() => {
        updateRemainingTime();
        interval = setInterval(updateRemainingTime, 1000);
        return () => clearInterval(interval);
    });

    $: if ($ratelimit) {
        updateRemainingTime();
    }
</script>

<div class="p-2 bg-gray-200 text-gray-700 rounded-md text-sm text-center">
    {#if $ratelimit.remaining > 0}
        <span>API Quota: <strong>{$ratelimit.remaining} / {$ratelimit.limit}</strong> requests remaining.</span>
    {:else}
        <span class="font-bold text-orange-600">API quota exhausted. Downloads paused.</span>
    {/if}
    <span class="ml-2 text-gray-500">({remainingTime})</span>
</div>
