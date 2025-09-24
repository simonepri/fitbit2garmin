import type { FitbitToken, DataType, StoredFile, DownloadTask } from '$lib/types';
import { writable } from 'svelte/store';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import JSZip from 'jszip';

// --- Rate Limiter Store (kept internally in this module) ---
export interface RateLimitState {
    limit: number;
    remaining: number;
    resetAt: number; // UTC timestamp in milliseconds
}

export const ratelimit = writable<RateLimitState>({
    limit: 150,
    remaining: 150,
    resetAt: Date.now() + 3600 * 1000
});

function updateRateLimitFromHeaders(headers: Headers) {
    const limit = headers.get('fitbit-rate-limit-limit');
    const remaining = headers.get('fitbit-rate-limit-remaining');
    const reset = headers.get('fitbit-rate-limit-reset');

    if (limit !== null && remaining !== null && reset !== null) {
        const resetAt = Date.now() + parseInt(reset, 10) * 1000;
        ratelimit.set({
            limit: parseInt(limit, 10),
            remaining: parseInt(remaining, 10),
            resetAt
        });
    }
}

import { get } from 'svelte/store';

// --- API Fetcher ---

async function fetchProxy(path: string, token: FitbitToken, options: RequestInit = {}): Promise<Response> {
    // Proactive rate limiting delay
    const rateLimitState = get(ratelimit);
    const now = Date.now();
    const timeToReset = rateLimitState.resetAt > now ? rateLimitState.resetAt - now : 3600 * 1000;
    const remaining = rateLimitState.remaining > 1 ? rateLimitState.remaining -1 : 1; // -1 to be safe
    const dynamicDelay = Math.max(1000, timeToReset / remaining);

    await new Promise(r => setTimeout(r, dynamicDelay));

    const authHeader = `Bearer ${token.access_token}`;
    const response = await fetch(`/api/fitbit-proxy/${path}`, {
        ...options,
        headers: { ...options.headers, Authorization: authHeader }
    });

    updateRateLimitFromHeaders(response.headers);

    if (response.status === 429) {
        ratelimit.update(r => ({ ...r, remaining: 0 }));
        throw new Error('Too Many Requests');
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message);
    }
    return response;
}

// --- Data Processing Functions (Moved from downloads.ts) ---

async function processWeightTask(task: DownloadTask, token: FitbitToken): Promise<StoredFile[]> {
    const start = format(startOfMonth(new Date(task.year, task.month - 1)), 'yyyy-MM-dd');
    const end = format(endOfMonth(new Date(task.year, task.month - 1)), 'yyyy-MM-dd');
    const res = await fetchProxy(`1/user/-/body/log/weight/date/${start}/${end}.json`, token);
    const data = await res.json();

    if (data.weight && data.weight.length > 0) {
        const header = "Body\nDate,Weight,BMI,Fat";
        const rows = data.weight.map((d: any) => `${d.date},${d.weight},${d.bmi},${d.fat || '0'}`);
        const csv = [header, ...rows].join('\n');
        return [{
            id: task.id,
            taskId: task.id,
            type: 'weight',
            content: new Blob([csv], { type: 'text/csv' }),
            timestamp: Date.now()
        }];
    }
    return [];
}

async function processActivityTask(task: DownloadTask, token: FitbitToken): Promise<StoredFile[]> {
    const start = format(startOfMonth(new Date(task.year, task.month - 1)), 'yyyy-MM-dd');
    const end = format(endOfMonth(new Date(task.year, task.month - 1)), 'yyyy-MM-dd');
    const resources = ['activityCalories', 'calories', 'distance', 'floors', 'minutesSedentary', 'minutesLightlyActive', 'minutesFairlyActive', 'minutesVeryActive', 'steps'];
    const activityByDate: Record<string, any> = {};

    for (const resource of resources) {
        const res = await fetchProxy(`1/user/-/activities/${resource}/date/${start}/${end}.json`, token);
        const data = await res.json();
        for (const activity of data[`activities-${resource}`]) {
            if (!activityByDate[activity.dateTime]) activityByDate[activity.dateTime] = { date: activity.dateTime };
            activityByDate[activity.dateTime][resource] = activity.value;
        }
    }
    const entries = Object.values(activityByDate).filter(a => a.steps > 0);

    if (entries.length > 0) {
        const header = "Activities\nDate,Calories Burned,Steps,Distance,Floors,Minutes Sedentary,Minutes Lightly Active,Minutes Fairly Active,Minutes Very Active,Activity Calories";
        const rows = entries.map(e => `${e.date},${e.calories},${e.steps},${e.distance},${e.floors},${e.minutesSedentary},${e.minutesLightlyActive},${e.minutesFairlyActive},${e.minutesVeryActive},${e.activityCalories}`);
        const csv = [header, ...rows].join('\n');
        return [{ id: task.id, taskId: task.id, type: 'activity', content: new Blob([csv], { type: 'text/csv' }), timestamp: Date.now() }];
    }
    return [];
}

export async function getTcxActivities(task: DownloadTask, token: FitbitToken): Promise<any[]> {
    const start = format(startOfMonth(new Date(task.year, task.month - 1)), 'yyyy-MM-dd');
    const end = endOfMonth(new Date(task.year, task.month - 1));
    const res = await fetchProxy(`1/user/-/activities/list.json?afterDate=${start}&sort=asc&limit=100&offset=0`, token);
    const data = await res.json();
    return data.activities.filter((a: any) => new Date(a.originalStartTime) <= end && a.logType !== 'auto_detected' && a.tcxLink);
}

export async function downloadTcxFile(activity: any, task: DownloadTask, token: FitbitToken): Promise<StoredFile | null> {
    const res = await fetchProxy(`1/user/-/activities/${activity.logId}.tcx`, token);
    const tcxContent = await res.arrayBuffer();
    if (tcxContent.byteLength < 250) return null; // Empty file

    const fileId = `${task.year}-${String(task.month).padStart(2, '0')}-tcx-${activity.logId}`;
    return { id: fileId, taskId: task.id, type: 'tcx', content: new Blob([tcxContent]), timestamp: Date.now() };
}

export const dataProcessors: { [key in DataType]: (task: DownloadTask, token: FitbitToken) => Promise<StoredFile[]> } = {
    weight: processWeightTask,
    activity: processActivityTask,
    tcx: async (task, token) => {
        // This function is now a placeholder as TCX files are handled individually.
        return [];
    }
};