import { writable, get, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import type { DownloadTask, DataType, TaskStatus, FitbitToken, StoredFile } from '$lib/types';
import { eachMonthOfInterval, startOfMonth, endOfMonth, format } from 'date-fns';
import { auth } from './auth';
import { ratelimit } from './ratelimit';

// --- ETA Stores ---
export const downloadDurations = writable<number[]>([]);
export const queueStartTime = writable<number | null>(null);

function addDownloadDuration(duration: number) {
    downloadDurations.update(durations => {
        const newDurations = [duration, ...durations];
        if (newDurations.length > 20) newDurations.pop();
        return newDurations;
    });
}

// --- Client-side Fetch to Proxy ---

async function fetchProxy(path: string, token: FitbitToken, options: RequestInit = {}): Promise<Response> {
    // The proxy now passes through the Authorization header directly
    const authHeader = `Bearer ${token.access_token}`;

    const response = await fetch(`/api/fitbit-proxy/${path}`, {
        ...options,
        headers: {
            ...options.headers,
            Authorization: authHeader
        }
    });

    // Update rate limit store from response headers
    ratelimit.updateFromHeaders(response.headers);

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message);
    }

    return response;
}


// --- Store ---

const typeSortOrder = { weight: 0, activity: 1, tcx: 2 };

function sortTasks(tasks: DownloadTask[]): DownloadTask[] {
    return tasks.sort((a, b) => {
        const aDate = new Date(a.year, a.month - 1);
        const bDate = new Date(b.year, b.month - 1);
        if (aDate < bDate) return -1;
        if (aDate > bDate) return 1;
        return typeSortOrder[a.type] - typeSortOrder[b.type];
    });
}

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
                        emptyFiles: 0,
                        retries: 0
					});
				}
			}
		}

		if (newTasks.length > 0) {
            const updatedTasks = [...get({ subscribe }), ...newTasks];
			updateAndPersist(updatedTasks);
            // After adding tasks, run the pre-flight check for TCX tasks
            preFlightTcxTasks(newTasks.filter(t => t.type === 'tcx'));
		}

        // Trigger queue processing in case it was idle
        processQueue();

		return newTasks.length;
	}

    async function preFlightTcxTasks(tcxTasks: DownloadTask[]) {
        const token = get(auth);
        if (!token || tcxTasks.length === 0) return;

        for (const task of tcxTasks) {
            try {
                const start = startOfMonth(new Date(task.year, task.month - 1));
                const end = endOfMonth(start);
                const startStr = format(start, 'yyyy-MM-dd');

                const res = await fetchProxy(`1/user/-/activities/list.json?afterDate=${startStr}&sort=asc&limit=100&offset=0`, token);
                const data = await res.json();
                const activities = data.activities.filter((a: any) => new Date(a.originalStartTime) <= end && a.logType !== 'auto_detected' && a.tcxLink);

                update(tasks => tasks.map(t => t.id === task.id ? {...t, totalFiles: activities.length} : t));
                await db.saveTasks(get({ subscribe }));

            } catch (e) {
                console.error(`Failed pre-flight for task ${task.id}`, e);
                // We could optionally mark the task as failed here
            }
        }
    }

    function findNextTask(): DownloadTask | undefined {
        const tasks = get({ subscribe });
        const pending = tasks.filter(t => t.status === 'pending');
        if (pending.length === 0) return undefined;

        // Sort pending tasks by date then type to find the next one
        const sortedPending = sortTasks(pending);
        return sortedPending[0];
    }

    let isProcessing = false;
    let queueTimeout: any = null;

    async function processQueue() {
        if (!browser || isProcessing) return;

        clearTimeout(queueTimeout);

        const rateLimitState = get(ratelimit);
        const now = Date.now();

        if (rateLimitState.remaining === 0 && now < rateLimitState.resetAt) {
            const delay = rateLimitState.resetAt - now;
            console.log(`Rate limit hit. Pausing queue for ${delay / 1000}s`);
            queueTimeout = setTimeout(processQueue, delay);
            return;
        }

        const nextTask = findNextTask();
        if (!nextTask) {
            // Queue is finished
            if (get(queueStartTime) !== null) {
                queueStartTime.set(null);
            }
            return;
        }

        // Set start time if this is the first task run
        if (get(queueStartTime) === null) {
            queueStartTime.set(Date.now());
        }

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

        const startTime = Date.now();
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
        } finally {
            const duration = Date.now() - startTime;
            addDownloadDuration(duration);
            await db.saveTasks(get({ subscribe }));
        }
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
        let emptyCount = 0;

        for (const activity of activities) {
            try {
                const existingFile = await db.files.get(`tcx-${activity.logId}`);
                if (existingFile) {
                    completedCount++;
                    continue;
                }
                const tcxRes = await fetchProxy(`1/user/-/activities/${activity.logId}.tcx`, token);
                const tcxContent = await tcxRes.arrayBuffer();

                // Mirroring python logic: if file is very small, it's considered empty.
                if (tcxContent.byteLength < 250) {
                    emptyCount++;
                } else {
                    const file: StoredFile = { id: `tcx-${activity.logId}`, taskId: task.id, type: 'tcx', content: new Blob([tcxContent]), timestamp: Date.now() };
                    await db.addFile(file);
                    completedCount++;
                }
            } catch (e) {
                console.error(`Failed to download TCX for logId ${activity.logId}`, e);
                failedCount++;
            }
            // Update UI progressively
            update(ts => ts.map(t => t.id === task.id ? {...t, completedFiles: completedCount, failedFiles: failedCount, emptyFiles: emptyCount } : t));
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
                emptyFiles: 0,
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

    async function retryAllFailedTasks() {
        const tasksToRetry = get({ subscribe }).filter(t => t.status === 'failed');
        if (tasksToRetry.length === 0) return;

        for (const task of tasksToRetry) {
            await retryTask(task.id);
        }
    }

	return {
		subscribe,
        set, // Exposed for testing
        update, // Exposed for testing
		initialize,
		addTasks,
        retryTask,
        retryAllFailedTasks,
        clearAll,
        getFilesForTask: db.getFilesForTask.bind(db)
	};
}

export const downloads = createDownloadsStore();

export const sortedDownloads = derived(downloads, ($downloads) => {
    return sortTasks([...$downloads]);
});
