import { openDB, type IDBPDatabase } from 'idb';
import { writable, type Writable, get } from 'svelte/store';
import { Task, TaskStatus, DataType, type TaskState } from './tasks';
import type { FitbitAPI } from './fitbit-api';
import JSZip from 'jszip';

// --- Enums and Types ---

export enum QueueStatus {
	Idle = 'idle',
	Running = 'running'
}

export interface QueueStats {
	completed: number;
	failed: number;
	pending: number;
	total: number;
	runtime: number;
}

// --- Database ---

const DB_NAME = 'fitbit-downloader';
const DB_VERSION = 1;
const TASK_STORE = 'tasks';
const USER_ID_KEY = 'userId';

async function openDatabase(): Promise<IDBPDatabase> {
	return openDB(DB_NAME, DB_VERSION, {
		upgrade(db) {
			if (!db.objectStoreNames.contains(TASK_STORE)) {
				db.createObjectStore(TASK_STORE, { keyPath: 'id' });
			}
			// In a real app, you'd handle migrations here based on oldVersion
		},
		blocked() {
			alert('Please close other tabs with this app open.');
		},
		blocking() {
			//
		}
	});
}

// --- DownloadQueue Class ---

export class DownloadQueue {
	private db: IDBPDatabase | null = null;
	private fitbitApi: FitbitAPI;
	private userId: string | null = null;

	public tasks: Writable<Task[]> = writable([]);
	public status: Writable<QueueStatus> = writable(QueueStatus.Idle);
	public stats: Writable<QueueStats> = writable({
		completed: 0,
		failed: 0,
		pending: 0,
		total: 0,
		runtime: 0
	});

	constructor(fitbitApi: FitbitAPI) {
		this.fitbitApi = fitbitApi;
		this.fitbitApi.isLoggedIn.subscribe((loggedIn) => {
			if (loggedIn) {
				this.initialize();
			} else {
				this.clearData();
			}
		});
	}

	private async initialize(): Promise<void> {
		const token = this.fitbitApi.toJSON().token;
		if (!token) return;

		const storedUserId = localStorage.getItem(USER_ID_KEY);
		if (storedUserId && storedUserId !== token.user_id) {
			await this.clearData(true);
		}

		this.userId = token.user_id;
		localStorage.setItem(USER_ID_KEY, this.userId);

		this.db = await openDatabase();
		await this.loadTasksFromDB();
		this.startQueue();
	}

	private async loadTasksFromDB(): Promise<void> {
		if (!this.db) return;
		const tx = this.db.transaction(TASK_STORE, 'readonly');
		const taskStates = await tx.objectStore(TASK_STORE).getAll();
		const tasks = taskStates.map((state) => Task.fromJSON(state));
		this.tasks.set(tasks);
		this.updateStats();
	}

	private async saveTask(task: Task): Promise<void> {
		if (!this.db) return;
		const tx = this.db.transaction(TASK_STORE, 'readwrite');
		await tx.objectStore(TASK_STORE).put(task.toJSON());
		await tx.done;
		this.updateTasksInStore(task);
	}

	private updateTasksInStore(updatedTask: Task): void {
		this.tasks.update((currentTasks) => {
			const index = currentTasks.findIndex((t) => t.id === updatedTask.id);
			if (index !== -1) {
				currentTasks[index] = updatedTask;
			} else {
				currentTasks.push(updatedTask);
			}
			return [...currentTasks];
		});
		this.updateStats();
	}

	public async addTasks(
		startYear: number,
		startMonth: number,
		endYear: number,
		endMonth: number,
		dataTypes: DataType[]
	): Promise<number> {
		let newTasksCount = 0;
		const currentTasks = get(this.tasks);

		for (let year = startYear; year <= endYear; year++) {
			const mStart = year === startYear ? startMonth : 1;
			const mEnd = year === endYear ? endMonth : 12;

			for (let month = mStart; month <= mEnd; month++) {
				for (const type of dataTypes) {
					const taskId = `${type}-${year}-${String(month).padStart(2, '0')}`;
					if (currentTasks.some((t) => t.id === taskId)) {
						continue;
					}

					const state: TaskState = {
						id: taskId,
						type,
						year,
						month,
						status: TaskStatus.Pending,
						runtime: 0,
						files: []
					};
					const task = Task.fromJSON(state);
					await this.saveTask(task);
					newTasksCount++;
				}
			}
		}
		this.startQueue();
		return newTasksCount;
	}

	private getNextTask(): Task | undefined {
		const tasks = get(this.tasks);
		const pendingTasks = tasks.filter((t) => t.status === TaskStatus.Pending);
		if (pendingTasks.length === 0) {
			return undefined;
		}

		// Sort by year, month, then data type priority
		pendingTasks.sort((a, b) => {
			if (a.state.year !== b.state.year) return a.state.year - b.state.year;
			if (a.state.month !== b.state.month) return a.state.month - b.state.month;
			const priority = { [DataType.Weight]: 1, [DataType.Activity]: 2, [DataType.TCX]: 3 };
			return priority[a.state.type] - priority[b.state.type];
		});

		return pendingTasks[0];
	}

	public async startQueue(): Promise<void> {
		if (get(this.status) === QueueStatus.Running) return;

		this.status.set(QueueStatus.Running);
		this.processQueue();
	}

	private async processQueue(): Promise<void> {
		const task = this.getNextTask();
		if (!task) {
			this.status.set(QueueStatus.Idle);
			return;
		}

		await task.run(this.fitbitApi);
		await this.saveTask(task);

		// Process next task
		if (get(this.status) === QueueStatus.Running) {
			// Use setImmediate to avoid deep recursion
			setTimeout(() => this.processQueue(), 0);
		}
	}

	public async retryTask(taskId: string): Promise<void> {
		const tasks = get(this.tasks);
		const task = tasks.find((t) => t.id === taskId);
		if (task && (task.status === TaskStatus.Failed || task.status === TaskStatus.Completed)) {
			task.retry();
			await this.saveTask(task);
			this.startQueue();
		}
	}

	public async retryFailed(): Promise<void> {
		const tasks = get(this.tasks);
		const failedTasks = tasks.filter((t) => t.status === TaskStatus.Failed);
		for (const task of failedTasks) {
			task.retry();
			await this.saveTask(task);
		}
		this.startQueue();
	}

	public async clearData(force = false): Promise<void> {
		if (this.db) {
			if (!force) {
				const tx = this.db.transaction(TASK_STORE, 'readwrite');
				await tx.objectStore(TASK_STORE).clear();
				await tx.done;
			}
			this.db.close();
			this.db = null;
		}
		if (force) {
			await openDB(DB_NAME).then((db) => db.deleteObjectStore(TASK_STORE));
		}
		localStorage.removeItem(USER_ID_KEY);
		this.tasks.set([]);
		this.updateStats();
	}

	private updateStats(): void {
		const tasks = get(this.tasks);
		const stats: QueueStats = {
			completed: tasks.filter((t) => t.status === TaskStatus.Completed).length,
			failed: tasks.filter((t) => t.status === TaskStatus.Failed).length,
			pending: tasks.filter(
				(t) => t.status === TaskStatus.Pending || t.status === TaskStatus.Downloading
			).length,
			total: tasks.length,
			runtime: tasks.reduce((acc, t) => acc + t.state.runtime, 0)
		};
		this.stats.set(stats);
	}

	public async generateZip(): Promise<Blob> {
		const zip = new JSZip();
		const tasks = get(this.tasks);

		for (const task of tasks) {
			if (task.status !== TaskStatus.Completed) continue;

			const folderName = `${task.state.year}-${String(task.state.month).padStart(2, '0')}`;
			const folder = zip.folder(folderName);

			for (const file of task.state.files) {
				if (file.status !== 'completed' || !file.content) continue;

				let fileName = '';
				let fileExtension = '.csv';
				if (task.state.type === DataType.TCX) fileExtension = '.tcx';

				fileName = `${task.state.type}-${folderName}`;
				if (task.state.files.length > 1) {
					fileName += `-${file.id}`;
				}
				fileName += fileExtension;

				folder?.file(fileName, file.content);
			}
		}

		return zip.generateAsync({ type: 'blob' });
	}

	public static getAvailableDataTypes(): DataType[] {
		return Object.values(DataType);
	}
}
