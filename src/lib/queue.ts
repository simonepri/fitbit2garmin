import { writable, get, type Writable } from 'svelte/store';
import { openDB, type IDBPDatabase } from 'idb';
import JSZip from 'jszip';
import type { FitbitAPI } from './fitbit-api';
import { DownloadTask, TASK_TYPES, type TaskType, type TaskStatus } from './tasks';

type QueueStatus = 'idle' | 'running';

interface QueueStatistics {
	completed: number;
	failed: number;
	pending: number;
	totalRuntime: number; // in ms
}

const DB_NAME = 'fitbit2garmin';
const DB_VERSION = 1;
const TASK_STORE = 'tasks';
const RESULT_STORE = 'results';

export class DownloadQueueManager {
	private db: IDBPDatabase | null = null;
	private api: FitbitAPI | null = null;

	tasks$: Writable<DownloadTask[]> = writable([]);
	status$: Writable<QueueStatus> = writable('idle');
	statistics$: Writable<QueueStatistics> = writable({
		completed: 0,
		failed: 0,
		pending: 0,
		totalRuntime: 0
	});

	constructor() {
		this.tasks$.subscribe(() => this.updateStatistics());
	}

	async init(api: FitbitAPI) {
		this.api = api;
		this.db = await openDB(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(TASK_STORE)) {
					db.createObjectStore(TASK_STORE, { keyPath: 'id' });
				}
				if (!db.objectStoreNames.contains(RESULT_STORE)) {
					db.createObjectStore(RESULT_STORE, { keyPath: 'id' });
				}
			}
		});
		await this.loadTasksFromDB();
	}

	private updateStatistics() {
		const tasks = get(this.tasks$);
		const stats: QueueStatistics = { completed: 0, failed: 0, pending: 0, totalRuntime: 0 };
		for (const task of tasks) {
			if (task.status === 'completed') stats.completed++;
			if (task.status === 'failed') stats.failed++;
			if (task.status === 'pending') stats.pending++;
			stats.totalRuntime += task.runtime;
		}
		this.statistics$.set(stats);
	}

	private async loadTasksFromDB() {
		if (!this.db) return;
		const tasksData = await this.db.getAll(TASK_STORE);
		const tasks = tasksData.map((data) => DownloadTask.fromJSON(data));
		this.tasks$.set(this.sortTasks(tasks));
	}

	private sortTasks(tasks: DownloadTask[]): DownloadTask[] {
		return tasks.sort((a, b) => {
			if (a.date < b.date) return -1;
			if (a.date > b.date) return 1;
			const typeAIndex = TASK_TYPES.indexOf(a.type);
			const typeBIndex = TASK_TYPES.indexOf(b.type);
			return typeAIndex - typeBIndex;
		});
	}

	async startProcessing() {
		if (get(this.status$) === 'running') return;
		this.status$.set('running');
		this.processNextTask();
	}

	private async processNextTask() {
		if (get(this.status$) !== 'running') return;

		const nextTask = get(this.tasks$).find((t) => t.status === 'pending');
		if (!nextTask) {
			this.status$.set('idle');
			return;
		}

		if (!this.api) {
			this.status$.set('idle');
			return;
		}

		try {
			nextTask.status = 'running';
			this.tasks$.update((tasks) => [...tasks]);

			nextTask.startTimer();
			await nextTask.run(this.api);
			nextTask.stopTimer();
			nextTask.status = nextTask.error ? 'failed' : 'completed';
		} catch (e: any) {
			nextTask.stopTimer();
			nextTask.status = 'failed';
			nextTask.error = e.message || 'An unknown error occurred.';
		}

		await this.saveTask(nextTask);
		this.tasks$.update((tasks) => [...tasks]);

		setTimeout(() => this.processNextTask(), 0);
	}

	async addTasks(startDate: Date, endDate: Date, types: TaskType[]): Promise<number> {
		const currentTasks = get(this.tasks$);
		const newTasks: DownloadTask[] = [];

		let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
		while (currentDate <= endDate) {
			const yearMonth = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
			for (const type of types) {
				const taskId = `${type}-${yearMonth}`;
				if (!currentTasks.some((t) => t.id === taskId) && !newTasks.some((t) => t.id === taskId)) {
					const TaskClass = await this.getTaskClass(type);
					if(TaskClass) {
						newTasks.push(new TaskClass(yearMonth));
					}
				}
			}
			currentDate.setMonth(currentDate.getMonth() + 1);
		}

		if (newTasks.length > 0) {
			this.tasks$.update((tasks) => this.sortTasks([...tasks, ...newTasks]));
			const tx = this.db?.transaction(TASK_STORE, 'readwrite');
			if (tx) await Promise.all(newTasks.map((task) => tx.store.put(task.toJSON())));

			// The processing loop is already running or will be started from the layout.
			// This method's only job is to add tasks.
		}
		return newTasks.length;
	}

	private async getTaskClass(type: TaskType) {
		const tasksModule = await import('./tasks');
		switch (type) {
			case 'weight': return tasksModule.WeightDownloadTask;
			case 'activity': return tasksModule.ActivityDownloadTask;
			case 'tcx': return tasksModule.TcxDownloadTask;
		}
	}

	private async saveTask(task: DownloadTask) {
		if (!this.db) return;
		const tx = this.db.transaction([TASK_STORE, RESULT_STORE], 'readwrite');
		if (task.result.length > 0) {
			await tx.objectStore(RESULT_STORE).put({ id: task.id, results: task.result });
		}
		await tx.objectStore(TASK_STORE).put(task.toJSON());
		await tx.done;
	}

	async generateZip(): Promise<Blob> {
		if (!this.db) throw new Error('Database not initialized.');
		const zip = new JSZip();
		const completedTasks = get(this.tasks$).filter((t) => t.status === 'completed' && t.result.length > 0);
		for (const task of completedTasks) {
			const folder = zip.folder(task.date);
			const resultData = await this.db.get(RESULT_STORE, task.id);
			if (resultData?.results) {
				for (const file of resultData.results) {
					folder?.file(file.name, file.data);
				}
			}
		}
		return zip.generateAsync({ type: 'blob' });
	}

	async retryFailed() {
		get(this.tasks$).forEach((t) => { if (t.status === 'failed') this.resetTask(t); });
		if (get(this.status$) === 'idle') this.startProcessing();
	}

	async retryTask(taskId: string) {
		const task = get(this.tasks$).find((t) => t.id === taskId);
		if (task) {
			await this.resetTask(task);
			if (get(this.status$) === 'idle') this.startProcessing();
		}
	}

	private async resetTask(task: DownloadTask) {
		task.status = 'pending';
		task.error = null;
		task.progress = { total: 0, completed: 0, failed: 0, empty: 0 };
		task.runtime = 0;
		task.result = [];
		if (this.db) {
			const tx = this.db.transaction([TASK_STORE, RESULT_STORE], 'readwrite');
			await tx.objectStore(TASK_STORE).put(task.toJSON());
			await tx.objectStore(RESULT_STORE).delete(task.id);
			await tx.done;
		}
	}

	async clearAllData() {
		this.status$.set('idle');
		this.tasks$.set([]);
		if (this.db) {
			const tx = this.db.transaction([TASK_STORE, RESULT_STORE], 'readwrite');
			await tx.objectStore(TASK_STORE).clear();
			await tx.objectStore(RESULT_STORE).clear();
			await tx.done;
		}
		this.updateStatistics();
	}
}