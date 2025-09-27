import { writable, get } from 'svelte/store';
import { openDB, type IDBPDatabase } from 'idb';
import PQueue from 'p-queue';
import * as tasks from './tasks';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { fitbitAuth } from './fitbit-api';

const DB_NAME = 'fitbit-downloader';
const DB_VERSION = 1;
const STORE_NAME = 'queue';

export type QueueStatus = 'idle' | 'running';

type QueueState = {
	userId: string;
	tasks: tasks.Task[];
};

export class DownloadQueue {
	private db: IDBPDatabase | null = null;
	private queue: PQueue;

	public tasks = writable<tasks.Task[]>([]);
	public status = writable<QueueStatus>('idle');
	public totalRuntime = writable<number>(0);
	public completedTasks = writable<number>(0);
	public failedTasks = writable<number>(0);
	public pendingTasks = writable<number>(0);

	constructor() {
		this.queue = new PQueue({ concurrency: 1 });
		this.queue.on('idle', () => this.status.set('idle'));
		this.queue.on('active', () => this.status.set('running'));

		this.tasks.subscribe((tasks) => {
			this.updateStats(tasks);
			// Avoid saving initial empty state before db is ready
			if (this.db) {
				this.save();
			}
		});
	}

	public async init() {
		if (this.db) return; // Already initialized
		this.db = await openDB(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME);
				}
			}
		});
		await this.load();
	}

	private updateStats(tasks: tasks.Task[]) {
		this.totalRuntime.set(tasks.reduce((acc, t) => acc + t.runtime, 0));
		this.completedTasks.set(tasks.filter((t) => t.status === 'completed').length);
		this.failedTasks.set(tasks.filter((t) => t.status === 'failed').length);
		this.pendingTasks.set(tasks.filter((t) => t.status === 'pending').length);
	}

	private async save() {
		if (!this.db) return;
		const state: QueueState = {
			userId: get(fitbitAuth).user_id,
			tasks: get(this.tasks).map((t) => t.toJSON() as tasks.Task)
		};
		await this.db.put(STORE_NAME, state, 'main');
	}

	async load() {
		if (!this.db) return;
		const state = (await this.db.get(STORE_NAME, 'main')) as QueueState | undefined;
		const currentUserId = get(fitbitAuth).user_id;

		if (state && state.userId === currentUserId) {
			const loadedTasks = state.tasks.map((taskData) => tasks.Task.fromJSON(taskData));
			// Resume tasks that were 'downloading' on page reload
			loadedTasks.filter((t) => t.status === 'downloading').forEach((t) => (t.status = 'pending'));
			this.tasks.set(loadedTasks);
			this.start();
		} else if (state && state.userId !== currentUserId) {
			await this.eraseData();
		}
	}

	addTasks(start: Date, end: Date, types: tasks.TaskType[]) {
		const currentTasks = get(this.tasks);
		let newTasksCount = 0;

		for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
			const year = d.getFullYear();
			const month = d.getMonth() + 1;

			for (const type of types) {
				const taskId = `${type}-${year}-${month}`;
				if (!currentTasks.some((t) => t.id === taskId)) {
					let task: tasks.Task;
					switch (type) {
						case 'weight':
							task = new tasks.WeightTask(year, month);
							break;
						case 'activity':
							task = new tasks.ActivityTask(year, month);
							break;
						case 'tcx':
							task = new tasks.TcxTask(year, month);
							break;
					}
					currentTasks.push(task);
					newTasksCount++;
				}
			}
		}

		if (newTasksCount > 0) {
			this.tasks.set([...currentTasks]);
			this.start();
		}
		return newTasksCount;
	}

	private getTaskPriority(task: tasks.Task): number {
		const typePriority = { weight: 1, activity: 2, tcx: 3 };
		return task.year * 1000 + task.month * 10 + typePriority[task.type];
	}

	start() {
		const tasksToRun = get(this.tasks).filter((t) => t.status === 'pending');
		if (tasksToRun.length === 0) return;

		this.status.set('running');
		for (const task of tasksToRun) {
			this.queue.add(() => this.processTask(task.id), {
				priority: this.getTaskPriority(task)
			});
		}
	}

	private async processTask(taskId: string) {
		const allTasks = get(this.tasks);
		const task = allTasks.find((t) => t.id === taskId);
		if (!task || task.status !== 'pending') return;

		task.status = 'downloading';
		this.tasks.set([...allTasks]);

		await task.run();
		this.tasks.set([...allTasks]);
	}

	retryFailed() {
		const allTasks = get(this.tasks);
		allTasks.forEach((t) => {
			if (t.status === 'failed') {
				t.status = 'pending';
				t.progress.failed = 0;
				t.lastError = null;
			}
		});
		this.tasks.set([...allTasks]);
		this.start();
	}

	retryTask(taskId: string) {
		const allTasks = get(this.tasks);
		const task = allTasks.find((t) => t.id === taskId);
		if (task && (task.status === 'failed' || task.status === 'completed')) {
			task.status = 'pending';
			task.progress = { total: 0, completed: 0, failed: 0, empty: 0 };
			task.files = [];
			if (task.type === 'weight' || task.type === 'activity') {
				task.progress.total = 1;
			}
			this.tasks.set([...allTasks]);
			this.start();
		}
	}

	async eraseData() {
		this.queue.clear();
		this.tasks.set([]);
		if (this.db) {
			await this.db.clear(STORE_NAME);
		}
	}

	async generateZip() {
		const zip = new JSZip();
		const completedTasks = get(this.tasks);

		for (const task of completedTasks) {
			if (task.status === 'completed' && task.files.length > 0) {
				const folderName = `${task.year}-${String(task.month).padStart(2, '0')}`;
				const folder = zip.folder(folderName);
				for (const file of task.files) {
					folder?.file(file.name, file.content);
				}
			}
		}

		const blob = await zip.generateAsync({ type: 'blob' });
		saveAs(blob, `fitbit-export-${new Date().toISOString().split('T')[0]}.zip`);
	}
}

// UI will interact with a single instance via this store
export const downloadQueue = writable<DownloadQueue | null>(null);
export const availableTaskTypes: tasks.TaskType[] = ['weight', 'activity', 'tcx'];