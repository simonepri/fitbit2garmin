import { derived } from 'svelte/store';
import { downloads, downloadDurations, queueStartTime } from './downloads';
import { ratelimit } from './ratelimit';

export interface QueueStats {
    completed: number;
    failed: number;
    pending: number;
    total: number;
    status: 'IDLE' | 'DOWNLOADING' | 'PAUSED' | 'FINISHED';
    elapsed: string;
    remaining: string;
}

const movingAverage = derived(downloadDurations, ($durations) => {
    if ($durations.length === 0) return 0;
    const sum = $durations.reduce((a, b) => a + b, 0);
    return sum / $durations.length;
});

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

export const stats = derived(
    [downloads, ratelimit, movingAverage, queueStartTime],
    ([$downloads, $ratelimit, $movingAverage, $queueStartTime]) => {
        const completed = $downloads.filter(t => t.status === 'completed').length;
        const failed = $downloads.filter(t => t.status === 'failed').length;
        const pending = $downloads.filter(t => t.status === 'pending' || t.status === 'downloading').length;
        const isDownloading = $downloads.some(t => t.status === 'downloading');
        const total = $downloads.length;

        let status: QueueStats['status'] = 'IDLE';
        if (isDownloading) {
            status = 'DOWNLOADING';
        } else if (pending > 0 && $ratelimit.remaining === 0) {
            status = 'PAUSED';
        } else if (pending === 0 && total > 0) {
            status = 'FINISHED';
        }

        const elapsed = $queueStartTime ? formatDuration(Date.now() - $queueStartTime) : '0s';

        let remaining = '';
        if (pending > 0 && $movingAverage > 0) {
            const timeForTasks = pending * $movingAverage;
            const now = Date.now();
            const timeForRateLimit = now < $ratelimit.resetAt && $ratelimit.remaining === 0
                ? $ratelimit.resetAt - now
                : 0;
            remaining = `~${formatDuration(timeForTasks + timeForRateLimit)}`;
        }

        return {
            completed,
            failed,
            pending,
            total,
            status,
            elapsed,
            remaining
        };
    }
);

import { writable } from 'svelte/store';
