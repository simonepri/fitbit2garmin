import { writable, get as getStoreValue } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { get, set, del } from 'idb-keyval';
import { Task, WeightTask, ActivityTask, TcxTask, type TaskType } from './tasks';
import type { FitbitApi } from '$lib/fitbit-api';
import JSZip from 'jszip';
import { browser } from '$app/environment';

type QueueStatus = 'idle' | 'running';

export const availableTaskTypes: TaskType[] = ['weight', 'activity', 'tcx'];

type SavedTask = ReturnType<Task['toJSON']>;
interface SavedQueueState {
	tasks: SavedTask[];
	status: QueueStatus;
	userId?: string;
}

export interface QueueState {
	tasks: Task[];
	status: QueueStatus;
	userId?: string;
}

const taskTypeMap = {
	weight: WeightTask,
	activity: ActivityTask,
	tcx: TcxTask
};

export class DownloadQueue {
	private state: Writable<QueueState>;
	private fitbitApi: FitbitApi;

	constructor(fitbitApi: FitbitApi) {
		this.fitbitApi = fitbitApi;
		this.state = writable({ tasks: [], status: 'idle' });

		if (browser) {
			this.load();
		}
	}

	public get tasks() {
		return this.state;
	}

	private async load() {
		const savedState = await get<SavedQueueState>('download-queue');
		const authState = getStoreValue(this.fitbitApi.authState);

		if (savedState && savedState.userId === authState.userId) {
			const tasks = savedState.tasks
				.map((taskData) => {
					const TaskClass = taskTypeMap[taskData.type];
					if (!TaskClass) return null;
					const task = new TaskClass(taskData.date.year, taskData.date.month);
					Object.assign(task, taskData);
					return task;
				})
				.filter((task): task is Task => !!task);
			this.state.update((s) => ({ ...s, tasks, userId: savedState.userId }));
		} else if (savedState) {
			// User mismatch, clear old data
			await del('download-queue');
		}

		const currentState = getStoreValue(this.state);
		if (currentState.status === 'running') {
			this.start();
		}
	}

	private async save() {
		if (!browser) return;
		const state = getStoreValue(this.state);
		const authState = getStoreValue(this.fitbitApi.authState);
		const serializableState = {
			userId: authState.userId,
			tasks: state.tasks.map((t) => t.toJSON()),
			status: state.status
		};
		await set('download-queue', serializableState);
	}

	public addTasks(
		start: { year: number; month: number },
		end: { year: number; month: number },
		types: TaskType[]
	): number {
		const newTasks: Task[] = [];
		const currentDate = new Date(start.year, start.month - 1, 1);
		const endDate = new Date(end.year, end.month - 1, 1);

		while (currentDate <= endDate) {
			const year = currentDate.getFullYear();
			const month = currentDate.getMonth() + 1;
			for (const type of types) {
				const taskId = `${type}-${year}-${month}`;
				if (!getStoreValue(this.state).tasks.some((t) => t.id === taskId)) {
					const TaskClass = taskTypeMap[type];
					newTasks.push(new TaskClass(year, month));
				}
			}
			currentDate.setMonth(currentDate.getMonth() + 1);
		}

		if (newTasks.length > 0) {
			this.state.update((s) => {
				s.tasks.push(...newTasks);
				s.tasks.sort(this.taskSorter);
				return s;
			});
			this.save();
		}

		if (getStoreValue(this.state).status === 'idle') {
			this.start();
		}

		return newTasks.length;
	}

	private taskSorter(a: Task, b: Task): number {
		if (a.date.year !== b.date.year) return a.date.year - b.date.year;
		if (a.date.month !== b.date.month) return a.date.month - b.date.month;
		return availableTaskTypes.indexOf(a.type) - availableTaskTypes.indexOf(b.type);
	}

	private async processQueue() {
		const state = getStoreValue(this.state);
		if (state.status !== 'running') return;

		const nextTask = state.tasks.find((t) => t.status === 'pending');
		if (!nextTask) {
			this.stop();
			return;
		}

		nextTask.startTimer();
		await nextTask.run(this.fitbitApi);
		nextTask.stopTimer();

		this.state.update((s) => ({ ...s })); // Trigger reactivity
		await this.save();

		// Process next task
		setTimeout(() => this.processQueue(), 0);
	}

	public start() {
		this.state.update((s) => {
			if (s.status === 'running') return s;
			s.status = 'running';
			return s;
		});
		this.processQueue();
	}

	public stop() {
		this.state.update((s) => ({ ...s, status: 'idle' }));
		this.save();
	}

	public retryTask(taskId: string) {
		this.state.update((s) => {
			const task = s.tasks.find((t) => t.id === taskId);
			if (task && (task.status === 'failed' || task.status === 'completed')) {
				task.status = 'pending';
				// For TCX tasks, we might need to reset individual file statuses
				if (task instanceof TcxTask) {
					task.files.forEach((f) => {
						if (f.status === 'failed') f.status = 'pending';
					});
				}
			}
			return s;
		});
		this.save();
		if (getStoreValue(this.state).status === 'idle') {
			this.start();
		}
	}

	public retryFailed() {
		this.state.update((s) => {
			s.tasks.forEach((t) => {
				if (t.status === 'failed') {
					t.status = 'pending';
					if (t instanceof TcxTask) {
						t.files.forEach((f) => {
							if (f.status === 'failed') f.status = 'pending';
						});
					}
				}
			});
			return s;
		});
		this.save();
		if (getStoreValue(this.state).status === 'idle') {
			this.start();
		}
	}

	public async eraseData() {
		this.stop();
		this.state.set({ tasks: [], status: 'idle' });
		await del('download-queue');
	}

	public async generateZip(): Promise<Blob> {
		const zip = new JSZip();
		const state = getStoreValue(this.state);

		for (const task of state.tasks) {
			if (task.status === 'completed') {
				for (const file of task.files) {
					if (file.status === 'completed' && file.content) {
						const path = `${task.date.year}-${String(task.date.month).padStart(2, '0')}/${task.type}-${task.date.year}-${String(task.date.month).padStart(2, '0')}${task.type === 'tcx' ? '-' + file.id : ''}.${task.type === 'tcx' ? 'tcx' : 'csv'}`;
						zip.file(path, file.content);
					}
				}
			}
		}

		return zip.generateAsync({ type: 'blob' });
	}
}
