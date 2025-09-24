import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import type { DownloadTask, DataType, TaskStatus, FitbitToken, StoredFile } from '$lib/types';
import { eachMonthOfInterval, startOfMonth, endOfMonth, format } from 'date-fns';
import { auth } from './auth';

// --- Client-side Fetch to Proxy ---

async function fetchProxy(path: string, token: FitbitToken, options: RequestInit = {}): Promise<Response> {
    const response = await fetch(`/api/fitbit-proxy/${path}`, {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${JSON.stringify(token)}`
        }
    });

    if (response.headers.has('X-Refreshed-Token')) {
        const refreshedTokenStr = response.headers.get('X-Refreshed-Token');
        if (refreshedTokenStr) {
            auth.updateToken(JSON.parse(refreshedTokenStr));
        }
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message);
    }

    return response;
}


// --- Store ---

function createDownloadsStore() {
	const { subscribe, update, set } = writable<DownloadTask[]>([]);

	async function initialize() {
		if (browser) {
			const tasks = await db.loadTasks();
			// On load, reset any "downloading" tasks to "pending"
			// so they can be picked up again.
			const sanitizedTasks = tasks.map(t =>
                t.status === 'downloading' ? { ...t, status: 'pending' as TaskStatus } : t
            );
			set(sanitizedTasks);
            // After initializing, immediately try to process the queue
            processQueue();
		}
	}

	async function updateAndPersist(tasks: DownloadTask[]) {
		await db.saveTasks(tasks);
		set(tasks);
	}

	function addTasks(startDate: Date, endDate: Date, types: DataType[]) {
		const newTasks: DownloadTask[] = [];
		const existingTasks = get({ subscribe });

		const months = eachMonthOfInterval({ start: startDate, end: endDate });

		for (const monthDate of months) {
			for (const type of types) {
				const year = monthDate.getFullYear();
				const month = monthDate.getMonth() + 1;
				const taskId = `${type}-${year}-${month}`;

				if (!existingTasks.some((t) => t.id === taskId)) {
					newTasks.push({
						id: taskId,
						type,
						year,
						month,
						status: 'pending',
						totalFiles: 0,
						completedFiles: 0,
						failedFiles: 0,
                        retries: 0
					});
				}
			}
		}

		if (newTasks.length > 0) {
			update((currentTasks) => {
                const updated = [...currentTasks, ...newTasks];
                // Persist asynchronously
                db.saveTasks(updated);
                return updated;
            });
		}

        // Trigger queue processing in case it was idle
        processQueue();

		return newTasks.length;
	}

    function findNextTask(): DownloadTask | undefined {
        const tasks = get({ subscribe });
        const pending = tasks.filter(t => t.status === 'pending');
        if (pending.length === 0) return undefined;

        // Priority: weight > activity > tcx
        return pending.find(t => t.type === 'weight')
            || pending.find(t => t.type === 'activity')
            || pending.find(t => t.type === 'tcx');
    }

    let isProcessing = false;
    async function processQueue() {
        if (!browser || isProcessing) return;

        const nextTask = findNextTask();
        if (!nextTask) return; // No tasks to process

        isProcessing = true;

        try {
            await processTask(nextTask);
        } catch (e) {
            console.error(`Failed to process task ${nextTask.id}`, e);
            // Mark task as failed on unexpected error
            update(tasks => tasks.map(t => t.id === nextTask.id ? {...t, status: 'failed'} : t));
            await db.saveTasks(get({ subscribe }));
        } finally {
            isProcessing = false;
            // Process the next item in the queue
            setTimeout(processQueue, 0);
        }
    }

    async function processTask(task: DownloadTask) {
        update(tasks => tasks.map(t => t.id === task.id ? { ...t, status: 'downloading' } : t));
        await db.saveTasks(get({ subscribe }));

        const token = get(auth);
        if (!token) throw new Error('Not authenticated');

        const start = startOfMonth(new Date(task.year, task.month - 1));
        const end = endOfMonth(start);
        const startStr = format(start, 'yyyy-MM-dd');
        const endStr = format(end, 'yyyy-MM-dd');

        try {
            switch (task.type) {
                case 'weight':
                    await processWeightTask(task, token, startStr, endStr);
                    break;
                case 'activity':
                    await processActivityTask(task, token, startStr, endStr);
                    break;
                case 'tcx':
                    await processTcxTask(task, token, start, end);
                    break;
            }
            // If any files failed, the whole task is failed, otherwise completed
            const finalStatus = get({subscribe}).find(t => t.id === task.id)?.failedFiles ?? 0 > 0 ? 'failed' : 'completed';
            update(tasks => tasks.map(t => t.id === task.id ? { ...t, status: finalStatus } : t));
        } catch (error) {
            console.error(`Error processing task ${task.id}:`, error);
            update(tasks => tasks.map(t => t.id === task.id ? { ...t, status: 'failed' } : t));
        }
        await db.saveTasks(get({ subscribe }));
    }

    async function processWeightTask(task: DownloadTask, token: FitbitToken, start: string, end: string) {
        const res = await fetchProxy(`1/user/-/body/log/weight/date/${start}/${end}.json`, token);
        const data = await res.json();

        if (data.weight && data.weight.length > 0) {
            const header = "Body\nDate,Weight,BMI,Fat";
            const rows = data.weight.map((d: any) => `${d.date},${d.weight},${d.bmi},${d.fat || '0'}`);
            const csv = [header, ...rows].join('\n');
            const file: StoredFile = {
                id: task.id,
                taskId: task.id,
                type: 'weight',
                content: new Blob([csv], { type: 'text/csv' }),
                timestamp: Date.now()
            };
            await db.addFile(file);
            update(ts => ts.map(t => t.id === task.id ? {...t, totalFiles: 1, completedFiles: 1} : t));
        } else {
             update(ts => ts.map(t => t.id === task.id ? {...t, totalFiles: 0} : t));
        }
    }

    async function processActivityTask(task: DownloadTask, token: FitbitToken, start: string, end: string) {
        const resources = ['activityCalories', 'calories', 'distance', 'floors', 'minutesSedentary', 'minutesLightlyActive', 'minutesFairlyActive', 'minutesVeryActive', 'steps'];
        const activityByDate: Record<string, any> = {};

        for (const resource of resources) {
            const res = await fetchProxy(`1/user/-/activities/${resource}/date/${start}/${end}.json`, token);
            const data = await res.json();
            for (const activity of data[`activities-${resource}`]) {
                if (!activityByDate[activity.dateTime]) {
                    activityByDate[activity.dateTime] = { date: activity.dateTime };
                }
                activityByDate[activity.dateTime][resource] = activity.value;
            }
        }
        const entries = Object.values(activityByDate).filter(a => a.steps > 0);

        if (entries.length > 0) {
            const header = "Activities\nDate,Calories Burned,Steps,Distance,Floors,Minutes Sedentary,Minutes Lightly Active,Minutes Fairly Active,Minutes Very Active,Activity Calories";
            const rows = entries.map((e: any) => `${e.date},${e.calories},${e.steps},${e.distance},${e.floors},${e.minutesSedentary},${e.minutesLightlyActive},${e.minutesFairlyActive},${e.minutesVeryActive},${e.activityCalories}`);
            const csv = [header, ...rows].join('\n');
            const file: StoredFile = { id: task.id, taskId: task.id, type: 'activity', content: new Blob([csv], { type: 'text/csv' }), timestamp: Date.now() };
            await db.addFile(file);
            update(ts => ts.map(t => t.id === task.id ? {...t, totalFiles: 1, completedFiles: 1} : t));
        } else {
            update(ts => ts.map(t => t.id === task.id ? {...t, totalFiles: 0} : t));
        }
    }

    async function processTcxTask(task: DownloadTask, token: FitbitToken, start: Date, end: Date) {
        const startStr = format(start, 'yyyy-MM-dd');
        const res = await fetchProxy(`1/user/-/activities/list.json?afterDate=${startStr}&sort=asc&limit=100&offset=0`, token);
        const data = await res.json();

        const activities = data.activities.filter((a: any) => new Date(a.originalStartTime) <= end && a.logType !== 'auto_detected' && a.tcxLink);

        update(ts => ts.map(t => t.id === task.id ? {...t, totalFiles: activities.length} : t));
        await db.saveTasks(get({subscribe}));

        if (activities.length === 0) return;

        let completedCount = 0;
        let failedCount = 0;

        for (const activity of activities) {
            try {
                const existingFile = await db.files.get(`tcx-${activity.logId}`);
                if (existingFile) {
                    completedCount++;
                    continue;
                }
                const tcxRes = await fetchProxy(`1/user/-/activities/${activity.logId}.tcx`, token);
                const tcxContent = await tcxRes.arrayBuffer();
                if (tcxContent.byteLength > 200) {
                    const file: StoredFile = { id: `tcx-${activity.logId}`, taskId: task.id, type: 'tcx', content: new Blob([tcxContent]), timestamp: Date.now() };
                    await db.addFile(file);
                    completedCount++;
                } else {
                    failedCount++;
                }
            } catch (e) {
                console.error(`Failed to download TCX for logId ${activity.logId}`, e);
                failedCount++;
            }
            // Update UI progressively
            update(ts => ts.map(t => t.id === task.id ? {...t, completedFiles: completedCount, failedFiles: failedCount } : t));
            await db.saveTasks(get({ subscribe }));
        }
    }

    async function retryTask(taskId: string) {
        update(tasks => {
            const task = tasks.find(t => t.id === taskId);
            if (!task || (task.status !== 'failed' && task.status !== 'completed')) return tasks;

            // Reset status and counters for retry/refresh
            return tasks.map(t => t.id === taskId ? {
                ...t,
                status: 'pending' as TaskStatus,
                completedFiles: 0,
                failedFiles: 0,
                retries: task.status === 'failed' ? t.retries + 1 : t.retries
            } : t);
        });
        await db.saveTasks(get({ subscribe }));
        await db.deleteFilesForTask(taskId);
        processQueue();
    }

    async function clearAll() {
        if (browser) {
            await db.clearAllData();
            set([]);
        }
    }

	return {
		subscribe,
        set, // Exposed for testing
		initialize,
		addTasks,
        retryTask,
        clearAll,
        getFilesForTask: db.getFilesForTask
	};
}

export const downloads = createDownloadsStore();
