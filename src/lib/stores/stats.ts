import { derived } from 'svelte/store';
import { downloads, downloadDurations, queueStartTime, queueEndTime } from './downloads';
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

const averageDurations = derived(downloadDurations, ($durations) => {
    const avgs: { [key in DataType]?: number } = {};
    for (const type in $durations) {
        const durations = $durations[type as DataType] || [];
        if (durations.length > 0) {
            const sum = durations.reduce((a, b) => a + b, 0);
            avgs[type as DataType] = sum / durations.length;
        }
    }
    return avgs;
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
    [downloads, ratelimit, averageDurations, queueStartTime, queueEndTime],
    ([$downloads, $ratelimit, $averageDurations, $queueStartTime, $queueEndTime]) => {
        const completed = $downloads.filter(t => t.status === 'completed').length;
        const failed = $downloads.filter(t => t.status === 'failed').length;
        const pendingTasks = $downloads.filter(t => t.status === 'pending' || t.status === 'downloading');
        const pending = pendingTasks.length;
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

        let elapsed = '0s';
        if ($queueStartTime) {
            if (status === 'FINISHED' && $queueEndTime) {
                elapsed = formatDuration($queueEndTime - $queueStartTime);
            } else if (status !== 'FINISHED') {
                elapsed = formatDuration(Date.now() - $queueStartTime);
            }
        }

        let remaining = '';
        if (pending > 0) {
            let timeForTasks = 0;
            for (const task of pendingTasks) {
                // Use the per-type average, or a default estimate (e.g., 5s) if no data yet
                timeForTasks += $averageDurations[task.type] || 5000;
            }

            const now = Date.now();
            const timeForRateLimit = now < $ratelimit.resetAt && $ratelimit.remaining < pending
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
