import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get, writable, type Writable } from 'svelte/store';
import { DownloadQueue } from './queue';
import * as idb from 'idb';
import PQueue from 'p-queue';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import * as tasks from './tasks';
import * as fitbitApi from './fitbit-api';
import type { Task, TaskStatus, TaskType } from './tasks';
import type { FitbitAuth } from '$lib/fitbit-api';

// Mock all dependencies at the top level
vi.mock('idb');
vi.mock('p-queue');
vi.mock('file-saver');
vi.mock('jszip');
vi.mock('./tasks');
vi.mock('./fitbit-api');
vi.mock('svelte-local-storage-store', () => ({
	persisted: (key: string, initial: unknown): Writable<unknown> => {
		return writable(initial);
	}
}));

const createMockTask = (
	year: number,
	month: number,
	type: TaskType,
	status: TaskStatus = 'pending'
): Task => ({
	id: `${type}-${year}-${month}`,
	type,
	year,
	month,
	status,
	progress: { total: 1, completed: 0, failed: 0, empty: 0 },
	files: [],
	lastError: null,
	toJSON: vi.fn(function () {
		return { ...this };
	}),
	run: vi.fn().mockResolvedValue(undefined),
	startTimer: vi.fn(),
	stopTimer: vi.fn()
});

describe('DownloadQueue Class', () => {
	let downloadQueue: DownloadQueue;
	let mockDb;
	let mockQueueInstance: PQueue;
	let mockZipInstance: JSZip;

	beforeEach(async () => {
		vi.clearAllMocks();

		mockDb = { get: vi.fn(), put: vi.fn(), clear: vi.fn() };
		vi.mocked(idb.openDB).mockResolvedValue(mockDb as any);

		const PQueueMock = vi.mocked(PQueue);
		PQueueMock.prototype.add = vi.fn((fn) => fn());
		PQueueMock.prototype.on = vi.fn();
		PQueueMock.prototype.clear = vi.fn();

		const JSZipMock = vi.mocked(JSZip);
		JSZipMock.prototype.folder = vi.fn().mockReturnThis();
		JSZipMock.prototype.file = vi.fn();
		JSZipMock.prototype.generateAsync = vi.fn().mockResolvedValue('zip-blob');

		vi.mocked(saveAs).mockImplementation(vi.fn());

		(vi.mocked(fitbitApi.fitbitAuth) as Writable<FitbitAuth>).subscribe = vi.fn((cb) => {
			cb({ user_id: 'test-user' } as FitbitAuth);
			return () => {};
		});

		vi.mocked(tasks.WeightTask).mockImplementation(
			(y, m) => createMockTask(y, m, 'weight') as tasks.WeightTask
		);
		vi.mocked(tasks.ActivityTask).mockImplementation(
			(y, m) => createMockTask(y, m, 'activity') as tasks.ActivityTask
		);
		vi.mocked(tasks.Task.fromJSON).mockImplementation((data: Record<string, unknown>) => {
			return createMockTask(
				data.year as number,
				data.month as number,
				data.type as TaskType,
				data.status as TaskStatus
			);
		});

		downloadQueue = new DownloadQueue();
		await downloadQueue.init();

		mockQueueInstance = PQueueMock.mock.instances[0];
		mockZipInstance = JSZipMock.mock.instances[0];
	});

	it('should initialize and load data, resetting downloading tasks to pending', async () => {
		const storedTasksData = [
			{ type: 'weight', year: 2023, month: 5, status: 'completed' },
			{ type: 'activity', year: 2023, month: 5, status: 'downloading' }
		];
		mockDb.get.mockResolvedValue({ userId: 'test-user', tasks: storedTasksData });
		await downloadQueue.load();
		expect(get(downloadQueue.tasks)[1].status).toBe('pending');
	});

	it('should clear data if user does not match', async () => {
		mockDb.get.mockResolvedValue({ userId: 'another-user', tasks: [{}] });
		await downloadQueue.load();
		expect(get(downloadQueue.tasks)).toHaveLength(0);
	});

	it('should add new tasks and start the queue', () => {
		downloadQueue.addTasks(new Date('2023-01-01'), new Date('2023-01-01'), ['weight']);
		expect(get(downloadQueue.tasks)).toHaveLength(1);
		expect(mockQueueInstance.add).toHaveBeenCalledTimes(1);
	});

	it('should retry failed tasks', () => {
		const failedTask = createMockTask(2023, 5, 'weight', 'failed');
		downloadQueue.tasks.set([failedTask]);
		downloadQueue.retryFailed();
		const task = get(downloadQueue.tasks)[0];
		expect(task.status).toBe('pending');
	});

	it('should generate a zip file', async () => {
		const completedTask = createMockTask(2023, 5, 'weight', 'completed');
		completedTask.files = [{ name: 'test.csv', content: 'data' }];
		downloadQueue.tasks.set([completedTask]);
		await downloadQueue.generateZip();
		expect(mockZipInstance.file).toHaveBeenCalledWith('test.csv', 'data');
		expect(saveAs).toHaveBeenCalled();
	});

	it('should erase all data', async () => {
		downloadQueue.addTasks(new Date('2023-01-01'), new Date('2023-01-01'), ['weight']);
		await downloadQueue.eraseData();
		expect(get(downloadQueue.tasks)).toHaveLength(0);
	});
});
