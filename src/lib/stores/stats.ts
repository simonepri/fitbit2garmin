import { derived, get } from 'svelte/store';
import { downloads, queueStartTime, queueEndTime } from './downloads';
import { ratelimit } from '$lib/client/api';

export interface QueueStats {
    completed: number;
    failed: number;
    pending: number;
    total: number;
    status: 'IDLE' | 'DOWNLOADING' | 'PAUSED' | 'FINISHED';
    elapsed: string;
}

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
    [downloads, queueStartTime, queueEndTime],
    ([$downloads, $queueStartTime, $queueEndTime]) => {
        const completed = $downloads.filter(t => t.status === 'completed').length;
        const failed = $downloads.filter(t => t.status === 'failed').length;
        const pending = $downloads.filter(t => t.status === 'pending' || t.status === 'downloading').length;
        const isDownloading = $downloads.some(t => t.status === 'downloading');
        const total = $downloads.length;

        let status: QueueStats['status'] = 'IDLE';
        if (isDownloading) {
            status = 'DOWNLOADING';
        } else if (pending > 0 && get(ratelimit).remaining === 0) {
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
            } else if (status === 'FINISHED' && !$queueEndTime) {
                // If finished but no end time, use start time to show total duration
                elapsed = formatDuration(0);
            }
        }

        return {
            completed,
            failed,
            pending,
            total,
            status,
            elapsed
        };
    }
);

import { writable } from 'svelte/store';
