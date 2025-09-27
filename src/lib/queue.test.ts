import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadQueue } from './queue';
import { FitbitAPI } from './fitbit-api';
import { Task, TaskStatus, DataType, type TaskState } from './tasks';
import { writable } from 'svelte/store';
import { openDB } from 'idb';

// --- Mocks ---

// Mock localStorage for Node.js environment
const mockLocalStorage = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: (key: string) => store[key] || null,
		setItem: (key: string, value: string) => (store[key] = value.toString()),
		removeItem: (key: string) => delete store[key],
		clear: () => (store = {})
	};
})();
Object.defineProperty(global, 'localStorage', {
	value: mockLocalStorage,
	writable: true
});

vi.mock('idb');

// Mock JSZip
const zipMock = {
	folder: vi.fn().mockReturnThis(),
	file: vi.fn(),
	generateAsync: vi.fn().mockResolvedValue(new Blob())
};
vi.mock('jszip', () => ({
	default: vi.fn(() => zipMock)
}));

// Mock FitbitAPI with a factory
const mockIsLoggedIn = writable(true);
vi.mock('./fitbit-api', () => {
	const FitbitAPI = vi.fn(() => ({
		isLoggedIn: mockIsLoggedIn,
		toJSON: () => ({ token: { user_id: 'test-user' } }),
		logout: vi.fn()
	}));
	return { FitbitAPI };
});

// Mock Task class
const mockRun = vi.fn().mockImplementation(async function (this: { state: TaskState }) {
	this.state.status = TaskStatus.Completed;
});
const mockRetry = vi.fn().mockImplementation(function (this: { state: TaskState }) {
	this.state.status = TaskStatus.Pending;
});

interface MockTask {
	state: TaskState;
	id: string;
	status: TaskStatus;
	run: vi.Mock;
	retry: vi.Mock;
	toJSON: () => TaskState;
	getProgress: () => { total: number; completed: number; failed: number; empty: number };
}

vi.mock('./tasks', async (importOriginal) => {
	const original = (await importOriginal()) as typeof import('./tasks');
	const MockTask = vi.fn(
		(state: TaskState): MockTask => ({
			state,
			id: state.id,
			get status() {
				return this.state.status;
			}, // Use a getter
			run: mockRun,
			retry: mockRetry,
			toJSON: () => state,
			getProgress: () => ({ total: 1, completed: 1, failed: 0, empty: 0 })
		})
	);

	return {
		...original,
		Task: { ...original.Task, fromJSON: (state: TaskState) => new MockTask(state) }
	};
});

describe('DownloadQueue', () => {
	let fitbitApi: FitbitAPI;
	let queue: DownloadQueue;
	let mockDb: {
		transaction: vi.Mock;
		objectStore: vi.Mock;
		getAll: vi.Mock;
		put: vi.Mock;
		clear: vi.Mock;
		close: vi.Mock;
		deleteObjectStore: vi.Mock;
		done: Promise<void>;
	};

	beforeEach(async () => {
		vi.clearAllMocks();
		mockLocalStorage.clear();
		zipMock.folder.mockClear();
		zipMock.file.mockClear();

		// Setup mock DB
		mockDb = {
			transaction: vi.fn().mockReturnThis(),
			objectStore: vi.fn().mockReturnThis(),
			getAll: vi.fn().mockResolvedValue([]),
			put: vi.fn().mockResolvedValue(undefined),
			clear: vi.fn().mockResolvedValue(undefined),
			close: vi.fn(),
			deleteObjectStore: vi.fn().mockResolvedValue(undefined),
			done: Promise.resolve()
		};
		(openDB as vi.Mock).mockResolvedValue(mockDb);

		fitbitApi = new FitbitAPI();
		mockIsLoggedIn.set(true);

		queue = new DownloadQueue(fitbitApi);
		await new Promise((resolve) => setTimeout(resolve, 0));
	});

	it('should initialize and load tasks from DB', async () => {
		const taskState = {
			id: 'weight-2023-01',
			type: DataType.Weight,
			year: 2023,
			month: 1,
			status: TaskStatus.Completed,
			runtime: 10,
			files: []
		};
		mockDb.getAll.mockResolvedValue([taskState]);

		const newQueue = new DownloadQueue(fitbitApi);
		await new Promise((resolve) => setTimeout(resolve, 0));

		const tasks = (await new Promise((resolve) => newQueue.tasks.subscribe(resolve))) as Task[];
		expect(tasks.length).toBe(1);
		expect(tasks[0].id).toBe('weight-2023-01');
	});

	it('should add new tasks and start the queue', async () => {
		const addedCount = await queue.addTasks(2023, 1, 2023, 1, [DataType.Weight, DataType.Activity]);
		expect(addedCount).toBe(2);

		const tasks = (await new Promise((resolve) => queue.tasks.subscribe(resolve))) as Task[];
		expect(tasks.length).toBe(2);

		// Should start processing
		expect(mockRun).toHaveBeenCalled();
	});

	it('should not add duplicate tasks', async () => {
		await queue.addTasks(2023, 1, 2023, 1, [DataType.Weight]);
		const addedCount = await queue.addTasks(2023, 1, 2023, 1, [DataType.Weight]);
		expect(addedCount).toBe(0);
		const tasks = (await new Promise((resolve) => queue.tasks.subscribe(resolve))) as Task[];
		expect(tasks.length).toBe(1);
	});

	it('should retry a failed task', async () => {
		await queue.addTasks(2023, 5, 2023, 5, [DataType.Weight]);
		const tasks = (await new Promise((resolve) => queue.tasks.subscribe(resolve))) as MockTask[];
		const task = tasks[0];
		task.state.status = TaskStatus.Failed; // Manually set status for test

		await queue.retryTask(task.id);
		expect(mockRetry).toHaveBeenCalled();
	});

	it('should generate a zip file', async () => {
		await queue.addTasks(2023, 1, 2023, 1, [DataType.Weight]);
		const tasks = (await new Promise((resolve) => queue.tasks.subscribe(resolve))) as MockTask[];
		const task = tasks[0];
		task.state.status = TaskStatus.Completed;
		task.state.files = [{ id: 'file1', status: 'completed', content: 'data' }];

		const blob = await queue.generateZip();
		expect(blob).toBeInstanceOf(Blob);
		expect(zipMock.folder).toHaveBeenCalledWith('2023-01');
		expect(zipMock.file).toHaveBeenCalledWith('weight-2023-01.csv', 'data');
	});

	it('should clear data on logout', async () => {
		await queue.addTasks(2023, 1, 2023, 1, [DataType.Weight]);

		mockIsLoggedIn.set(false);
		await new Promise((resolve) => setTimeout(resolve, 0));

		const tasks = (await new Promise((resolve) => queue.tasks.subscribe(resolve))) as Task[];
		expect(tasks.length).toBe(0);
		expect(mockDb.clear).toHaveBeenCalled();
	});
});
