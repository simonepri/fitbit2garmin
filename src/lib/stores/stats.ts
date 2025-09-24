import { derived, get } from 'svelte/store';
import { downloads } from './downloads';
import { ratelimit } from '$lib/client/api';

export interface QueueStats {
    completed: number;
    failed: number;
    pending: number;
    total: number;
    status: 'IDLE' | 'DOWNLOADING' | 'PAUSED' | 'FINISHED';
    elapsed: string;
}

export function formatDuration(ms: number): string {
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
    downloads,
    ($downloads) => {
        const completed = $downloads.filter(t => t.status === 'completed').length;
        const failed = $downloads.filter(t => t.status === 'failed').length;
        const pending = $downloads.filter(t => t.status === 'pending' || t.status === 'downloading' || t.status === 'waiting').length;
        const isDownloading = $downloads.some(t => t.status === 'downloading');
        const isWaiting = $downloads.some(t => t.status === 'waiting');
        const total = $downloads.length;

        let status: QueueStats['status'] = 'IDLE';
        if (isDownloading) {
            status = 'DOWNLOADING';
        } else if (isWaiting) {
            status = 'PAUSED';
        } else if (pending === 0 && total > 0) {
            status = 'FINISHED';
        }

        const totalActiveTime = $downloads.reduce((acc, task) => {
            return acc + task.activeTime;
        }, 0);
        const elapsed = formatDuration(totalActiveTime);

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
