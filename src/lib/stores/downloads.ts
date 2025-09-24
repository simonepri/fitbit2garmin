import { writable, get, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import type { DownloadTask, DataType, TaskStatus, FitbitToken, StoredFile } from '$lib/types';
import { eachMonthOfInterval, startOfMonth, endOfMonth, format } from 'date-fns';
import { auth } from './auth';


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
    let activeTimer: any = null;

    const stopActiveTimer = () => {
        if (activeTimer) {
            clearInterval(activeTimer);
            activeTimer = null;
        }
    };

    const startActiveTimer = () => {
        stopActiveTimer(); // Ensure no duplicates
        activeTimer = setInterval(() => {
            update(tasks => {
                const runningTask = tasks.find(t => t.status === 'downloading');
                if (!runningTask) {
                    stopActiveTimer();
                    return tasks;
                }
                return tasks.map(t => t.id === runningTask.id ? { ...t, activeTime: t.activeTime + 1000 } : t);
            });
        }, 1000);
    };

	async function initialize() {
		if (browser) {
			const tasks = await db.loadTasks();
			// On load, reset any "downloading" tasks to "pending"
			const sanitizedTasks = tasks.map(t =>
                t.status === 'downloading' ? { ...t, status: 'pending' as TaskStatus } : t
            );
			set(sanitizedTasks);
            processQueue();
		}
	}

	async function updateAndPersist(tasks: DownloadTask[]) {
		await db.saveTasks(tasks);
		set(tasks);
	}

	async function addTasks(startDate: Date, endDate: Date, types: DataType[]) {
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
                        retries: 0,
                        activeTime: 0,
                        lastStartTime: null
					});
				}
			}
		}

		if (newTasks.length > 0) {
            const updatedTasks = [...get({ subscribe }), ...newTasks];
			await updateAndPersist(updatedTasks);
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
            stopActiveTimer();
            return;
        }

        isProcessing = true;

        try {
            await processTask(nextTask);
        } catch (e) {
            console.error(`Failed to process task ${nextTask.id}`, e);
            update(tasks => tasks.map(t => t.id === nextTask.id ? {...t, status: 'failed'} : t));
            await db.saveTasks(get({ subscribe }));
        } finally {
            isProcessing = false;
            setTimeout(processQueue, 0);
        }
    }

    async function processTask(task: DownloadTask) {
        update(tasks => tasks.map(t => t.id === task.id ? { ...t, status: 'downloading' } : t));
        startActiveTimer();
        await db.saveTasks(get({ subscribe }));

        const token = get(auth);
        if (!token) throw new Error('Not authenticated');

        try {
            if (task.type === 'tcx') {
                const activities = await api.getTcxActivities(task, token);
                update(tasks => tasks.map(t => t.id === task.id ? {...t, totalFiles: activities.length} : t));
                await db.saveTasks(get({subscribe}));

                if (activities.length === 0) {
                    update(tasks => tasks.map(t => t.id === task.id ? { ...t, status: 'completed' } : t));
                    return;
                }

                let completedCount = 0, failedCount = 0, emptyCount = 0;
                for (const activity of activities) {
                    try {
                        const file = await api.downloadTcxFile(activity, task, token);
                        if (file) {
                            await db.addFile(file);
                            completedCount++;
                        } else {
                            emptyCount++;
                        }
                    } catch (e) {
                        console.error(`Failed to download TCX for logId ${activity.logId}`, e);
                        failedCount++;
                    }
                    update(tasks => tasks.map(t => t.id === task.id ? {...t, completedFiles: completedCount, failedFiles: failedCount, emptyFiles: emptyCount } : t));
                    await db.saveTasks(get({subscribe}));
                }
            } else {
                const files = await api.dataProcessors[task.type](task, token);
                if (files.length > 0) {
                    for (const file of files) await db.addFile(file);
                    update(tasks => tasks.map(t => t.id === task.id ? {...t, totalFiles: files.length, completedFiles: files.length} : t));
                } else {
                    update(tasks => tasks.map(t => t.id === task.id ? {...t, totalFiles: 0} : t));
                }
            }

            const finalTaskState = get({subscribe}).find(t => t.id === task.id);
            const finalStatus = finalTaskState?.failedFiles ?? 0 > 0 ? 'failed' : 'completed';
            update(tasks => tasks.map(t => t.id === task.id ? { ...t, status: finalStatus } : t));

        } catch (error) {
            console.error(`Error processing task ${task.id}:`, error);
            update(tasks => tasks.map(t => t.id === task.id ? { ...t, status: 'failed', failedFiles: t.totalFiles || 1 } : t));
        } finally {
            stopActiveTimer();
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

    async function downloadAllCompleted(): Promise<Blob | null> {
        if (!browser) return null;

        const JSZip = (await import('jszip')).default;
        const { toast } = await import('./toast');

        try {
            toast.info('Preparing zip file...');
            const zip = new JSZip();
            const tasks = get({ subscribe });
            const tasksToDownload = tasks.filter(t => t.status === 'completed' && t.completedFiles > 0);

            if (tasksToDownload.length === 0) {
                toast.error('No completed tasks with files to download.');
                return null;
            }

            for (const task of tasksToDownload) {
                const files = await db.getFilesForTask(task.id);
                for (const file of files) {
                    const extension = file.type === 'tcx' ? 'tcx' : 'csv';
                    const path = `${task.year}-${String(task.month).padStart(2, '0')}/${file.id.replace(':', '_')}.${extension}`;
                    zip.file(path, file.content);
                }
            }

            const content = await zip.generateAsync({ type: 'blob' });
            toast.success('Zip file created!');
            return content;
        } catch (e: any) {
            console.error('Failed to create zip file', e);
            toast.error(`Failed to create zip: ${e.message}`);
            return null;
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
        getFilesForTask: db.getFilesForTask.bind(db),
        downloadAllCompleted
	};
}

export const downloads = createDownloadsStore();

export const sortedDownloads = derived(downloads, ($downloads) => {
    return sortTasks([...$downloads]);
});

export const stats = derived(
    downloads,
    ($downloads) => {
        const completed = $downloads.filter(t => t.status === 'completed').length;
        const failed = $downloads.filter(t => t.status === 'failed').length;
        const pending = $downloads.filter(t => t.status === 'pending' || t.status === 'downloading').length;
        const isDownloading = $downloads.some(t => t.status === 'downloading' || t.status === 'pending');
        const total = $downloads.length;

        let status: 'IDLE' | 'DOWNLOADING' = 'IDLE';
        if (isDownloading || pending > 0) {
            status = 'DOWNLOADING';
        }

        const totalActiveTime = $downloads.reduce((acc, task) => {
            return acc + task.activeTime;
        }, 0);

        return {
            completed,
            failed,
            pending,
            total,
            status,
            elapsed: totalActiveTime // The raw ms value
        };
    }
);