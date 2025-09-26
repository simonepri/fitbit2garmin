import { writable, get, derived } from 'svelte/store';
import { set, get as idbGet, del, keys, createStore } from 'idb-keyval';
import { Task } from './tasks';
import type { FitbitAPI } from './fitbit-api';
import JSZip from 'jszip';

type QueueStatus = 'idle' | 'running' | 'paused';

// Custom stores for tasks and blobs
const taskStore = (userId: string) => createStore(`task-store-${userId}`, 'tasks');
const blobStore = (userId: string) => createStore(`blob-store-${userId}`, 'blobs');

export class TaskQueue {
	public tasks = writable<Task[]>([]);
	public status = writable<QueueStatus>('idle');

	private fitbitApi: FitbitAPI;
	private userId: string | null = null;
	private isProcessing = false;

	constructor(fitbitApi: FitbitAPI) {
		this.fitbitApi = fitbitApi;
	}

	async init(userId: string): Promise<void> {
		const storedUserId = await idbGet<string | null>('userId');
		if (storedUserId && storedUserId !== userId) {
			// User has changed, clear the old user's data.
			this.userId = storedUserId;
			await this.clearAllData();
		}

		// Set the new user ID and load their tasks
		this.userId = userId;
		await set('userId', userId);
		await this.loadTasks();
		this.processQueue();
	}

	private async loadTasks(): Promise<void> {
		if (!this.userId) return;
		const taskKeys = (await keys(taskStore(this.userId))) as string[];
		const loadedTasks: Task[] = [];
		for (const key of taskKeys) {
			const json = await idbGet(key, taskStore(this.userId));
			if (json) {
				const task = Task.fromJSON(json);
				// Load blobs for completed files
				for (const file of task.files) {
					if (file.status === 'completed' && file.blob === null) {
						const blob = await idbGet<Blob | null>(
							`${task.id}-${file.name}`,
							blobStore(this.userId!)
						);
						file.blob = blob ?? null; // Coalesce undefined to null
					}
				}
				loadedTasks.push(task);
			}
		}
		this.tasks.set(this.sortTasks(loadedTasks));
	}

	async addTasks(newTasks: Task[]): Promise<number> {
		if (!this.userId) return 0;

		const currentTasks = get(this.tasks);
		const tasksToAdd: Task[] = [];

		for (const newTask of newTasks) {
			const isDuplicate = [...currentTasks, ...tasksToAdd].some(
				(t) => t.type === newTask.type && t.year === newTask.year && t.month === newTask.month
			);
			if (!isDuplicate) {
				tasksToAdd.push(newTask);
			}
		}

		if (tasksToAdd.length > 0) {
			for (const task of tasksToAdd) {
				await set(task.id, task.toJSON(), taskStore(this.userId));
			}
			this.tasks.update((all) => this.sortTasks([...all, ...tasksToAdd]));
			this.processQueue();
		}

		return tasksToAdd.length;
	}

	private async processQueue(): Promise<void> {
		if (this.isProcessing || get(this.status) === 'paused' || !this.userId) return;

		const nextTask = get(this.tasks).find((t) => t.status === 'pending');
		if (!nextTask) {
			this.status.set('idle');
			this.isProcessing = false;
			return;
		}

		this.isProcessing = true;
		this.status.set('running');
		nextTask.status = 'running';
		nextTask.startTimer();
		this.tasks.update((t) => t); // Trigger reactivity

		try {
			await nextTask.run(this.fitbitApi);
			nextTask.status = nextTask.failedFiles > 0 ? 'failed' : 'completed';
		} catch (error) {
			console.error(`Task ${nextTask.id} failed`, error);
			nextTask.status = 'failed';
		} finally {
			nextTask.stopTimer();
			nextTask.updatedAt = Date.now();
			await this.updateTask(nextTask);
			this.isProcessing = false;
			this.processQueue(); // Process next task
		}
	}

	async retryTask(taskId: string): Promise<void> {
		if (!this.userId) return;
		const task = get(this.tasks).find((t) => t.id === taskId);
		if (task && (task.status === 'failed' || task.status === 'completed')) {
			task.status = 'pending';
			// Only reset failed files to pending
			task.files.forEach((f) => {
				if (f.status === 'failed') f.status = 'pending';
			});
			await this.updateTask(task);
			this.processQueue();
		}
	}

	async retryAllFailed(): Promise<void> {
		if (!this.userId) return;
		const failedTasks = get(this.tasks).filter((t) => t.status === 'failed');
		for (const task of failedTasks) {
			// No need to await here, let them run in parallel in the background
			this.retryTask(task.id);
		}
	}

	async downloadCompleted(): Promise<Blob | null> {
		if (!this.userId) return null;
		const zip = new JSZip();
		const completedTasks = get(this.tasks).filter((t) => t.status === 'completed');

		for (const task of completedTasks) {
			for (const file of task.files) {
				if (file.status === 'completed' && file.blob) {
					const path = `${task.year}-${String(task.month).padStart(2, '0')}/${file.name}`;
					zip.file(path, file.blob);
				}
			}
		}

		const content = await zip.generateAsync({ type: 'blob' });
		return content.size > 0 ? content : null;
	}

	async clearAllData(): Promise<void> {
		if (this.userId) {
			const taskKeys = (await keys(taskStore(this.userId))) as string[];
			for (const key of taskKeys) {
				await del(key, taskStore(this.userId));
			}
			const blobKeys = (await keys(blobStore(this.userId))) as string[];
			for (const key of blobKeys) {
				await del(key, blobStore(this.userId));
			}
		}
		await del('userId');
		this.tasks.set([]);
		this.userId = null;
	}

	private async updateTask(task: Task): Promise<void> {
		if (!this.userId) return;
		await set(task.id, task.toJSON(), taskStore(this.userId));
		// Store blobs for completed files
		for (const file of task.files) {
			if (file.status === 'completed' && file.blob) {
				await set(`${task.id}-${file.name}`, file.blob, blobStore(this.userId));
			}
		}
		this.tasks.update((all) => this.sortTasks([...all]));
	}

	private sortTasks(tasks: Task[]): Task[] {
		const typeOrder = { weight: 0, activity: 1, tcx: 2 };
		return tasks.sort((a, b) => {
			if (a.year !== b.year) return a.year - b.year;
			if (a.month !== b.month) return a.month - b.month;
			return typeOrder[a.type] - typeOrder[b.type];
		});
	}

	// Reactive derived stores
	public stats = derived(this.tasks, ($tasks) => {
		return {
			total: $tasks.length,
			pending: $tasks.filter((t) => t.status === 'pending').length,
			running: $tasks.filter((t) => t.status === 'running').length,
			failed: $tasks.filter((t) => t.status === 'failed').length,
			completed: $tasks.filter((t) => t.status === 'completed').length,
			totalRuntime: $tasks.reduce((acc, t) => acc + t.runtime, 0)
		};
	});
}
