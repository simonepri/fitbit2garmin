import { writable, get, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import type { DownloadTask, DataType, TaskStatus, FitbitToken, StoredFile } from '$lib/types';
import { eachMonthOfInterval, startOfMonth, endOfMonth, format } from 'date-fns';
import { auth } from './auth';
import { ratelimit } from '$lib/client/api';

// --- ETA Stores ---
const QUEUE_START_TIME_KEY = 'queue_start_time';
const QUEUE_END_TIME_KEY = 'queue_end_time';

const initialStartTime = browser ? Number(localStorage.getItem(QUEUE_START_TIME_KEY) || '0') : 0;
export const queueStartTime = writable<number | null>(initialStartTime > 0 ? initialStartTime : null);
queueStartTime.subscribe(value => {
    if (browser) localStorage.setItem(QUEUE_START_TIME_KEY, String(value || '0'));
});

const initialEndTime = browser ? Number(localStorage.getItem(QUEUE_END_TIME_KEY) || '0') : 0;
export const queueEndTime = writable<number | null>(initialEndTime > 0 ? initialEndTime : null);
queueEndTime.subscribe(value => {
    if (browser) localStorage.setItem(QUEUE_END_TIME_KEY, String(value || '0'));
});

import * as api from '$lib/client/api';


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
		}

        // Trigger queue processing in case it was idle
        processQueue();

		return newTasks.length;
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

    async function processQueue() {
        if (!browser || isProcessing) return;

        const nextTask = findNextTask();
        if (!nextTask) {
            if (get(queueStartTime) !== null && get(queueEndTime) === null) {
                queueEndTime.set(Date.now());
            }
            return;
        }

        isProcessing = true;

        if (get(queueStartTime) === null) {
            queueStartTime.set(Date.now());
        }

        try {
            await processTask(nextTask);
        } catch (e) {
            console.error(`Failed to process task ${nextTask.id}`, e);
            update(tasks => tasks.map(t => t.id === nextTask.id ? {...t, status: 'failed'} : t));
            await db.saveTasks(get({ subscribe }));
        } finally {
            isProcessing = false;

            // Proactive rate limiting delay
            const rateLimitState = get(ratelimit);
            const now = Date.now();
            const timeToReset = rateLimitState.resetAt > now ? rateLimitState.resetAt - now : 3600 * 1000;
            const remaining = rateLimitState.remaining > 0 ? rateLimitState.remaining : 1;

            // Evenly space out remaining requests, with a minimum delay of 1s
            const dynamicDelay = Math.max(1000, timeToReset / remaining);

            console.log(`Next task in ${dynamicDelay / 1000}s`);
            setTimeout(processQueue, dynamicDelay);
        }
    }

    async function processTask(task: DownloadTask) {
        update(tasks => tasks.map(t => t.id === task.id ? { ...t, status: 'downloading', startTime: Date.now() } : t));
        await db.saveTasks(get({ subscribe }));

        const token = get(auth);
        if (!token) throw new Error('Not authenticated');

        try {
            if (task.type === 'tcx') {
                // TCX tasks are special: we get a list of files and download them one by one
                const activities = await api.getTcxActivities(task, token);
                update(tasks => tasks.map(t => t.id === task.id ? {...t, totalFiles: activities.length} : t));
                await db.saveTasks(get({subscribe}));

                if (activities.length === 0) {
                    // No files to download, task is complete but empty
                    update(tasks => tasks.map(t => t.id === task.id ? { ...t, status: 'completed', endTime: Date.now() } : t));
                    return;
                }

                let completedCount = 0, failedCount = 0, emptyCount = 0;
                for (const activity of activities) {
                    // Proactive delay before each TCX file download
                    const delay = new Promise(r => setTimeout(r, get(api.ratelimit).remaining > 1 ? 1000 : (get(api.ratelimit).resetAt - Date.now()) / (get(api.ratelimit).remaining + 1)));
                    await delay;

                    const file = await api.downloadTcxFile(activity, task, token);
                    if (file) {
                        await db.addFile(file);
                        completedCount++;
                    } else {
                        emptyCount++;
                    }
                    update(tasks => tasks.map(t => t.id === task.id ? {...t, completedFiles: completedCount, failedFiles: failedCount, emptyFiles: emptyCount } : t));
                    await db.saveTasks(get({subscribe}));
                }
            } else {
                // Weight and Activity tasks are processed in one go
                const files = await api.dataProcessors[task.type](task, token);
                if (files.length > 0) {
                    for (const file of files) await db.addFile(file);
                    update(tasks => tasks.map(t => t.id === task.id ? {...t, totalFiles: files.length, completedFiles: files.length} : t));
                } else {
                    update(tasks => tasks.map(t => t.id === task.id ? {...t, totalFiles: 0} : t));
                }
            }

            // Finalize task status
            const finalTaskState = get({subscribe}).find(t => t.id === task.id);
            const finalStatus = finalTaskState?.failedFiles ?? 0 > 0 ? 'failed' : 'completed';
            update(tasks => tasks.map(t => t.id === task.id ? { ...t, status: finalStatus, endTime: Date.now() } : t));

        } catch (error) {
            console.error(`Error processing task ${task.id}:`, error);
            update(tasks => tasks.map(t => t.id === task.id ? { ...t, status: 'failed', endTime: Date.now() } : t));
        } finally {
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
            queueStartTime.set(null);
            queueEndTime.set(null);
            api.ratelimit.set({ limit: 150, remaining: 150, resetAt: Date.now() + 3600 * 1000 });
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
