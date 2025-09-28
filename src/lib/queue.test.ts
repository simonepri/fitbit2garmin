import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { DownloadQueue } from './queue';
import { FitbitApi } from './fitbit-api';
import { Task, type TaskType } from './tasks';
import { get, writable } from 'svelte/store';
import * as idbKeyval from 'idb-keyval';
import JSZip from 'jszip';

// Mock dependencies
vi.mock('idb-keyval');
vi.mock('./fitbit-api');
vi.mock('$app/environment', () => ({ browser: true }));

// Mock jszip
const mockZipInstance = {
	file: vi.fn().mockReturnThis(),
	generateAsync: vi.fn().mockResolvedValue(new Blob(['zip content']))
};
vi.mock('jszip', () => ({
	default: vi.fn(() => mockZipInstance)
}));

// Mock Task classes
vi.mock('./tasks', async (importOriginal) => {
	const original = (await importOriginal()) as typeof import('./tasks');

	class MockTask extends original.Task {
		run = vi.fn().mockImplementation(async () => {
			this.status = 'completed';
			this.files = [{ id: this.id + '.txt', status: 'completed', content: new Blob(['test']) }];
		});
		constructor(type: TaskType, year: number, month: number) {
			super(type, year, month);
		}
	}

	class MockWeightTask extends MockTask {
		constructor(year: number, month: number) {
			super('weight', year, month);
		}
	}
	class MockActivityTask extends MockTask {
		constructor(year: number, month: number) {
			super('activity', year, month);
		}
	}
	class MockTcxTask extends MockTask {
		constructor(year: number, month: number) {
			super('tcx', year, month);
		}
	}

	return {
		...original,
		WeightTask: MockWeightTask,
		ActivityTask: MockActivityTask,
		TcxTask: MockTcxTask
	};
});

describe('DownloadQueue', () => {
	let queue: DownloadQueue;
	let mockFitbitApi: FitbitApi;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.mocked(idbKeyval.get).mockResolvedValue(null);
		vi.mocked(idbKeyval.set).mockResolvedValue(undefined);
		vi.mocked(idbKeyval.del).mockResolvedValue(undefined);
		vi.mocked(JSZip).mockClear();
		vi.mocked(mockZipInstance.file).mockClear();
		vi.mocked(mockZipInstance.generateAsync).mockClear();

		mockFitbitApi = {
			authState: writable({ userId: 'test-user' })
		} as FitbitApi;

		queue = new DownloadQueue(mockFitbitApi);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('should initialize an empty queue', () => {
		const state = get(queue.tasks);
		expect(state.tasks).toEqual([]);
		expect(state.status).toBe('idle');
	});

	it('should add tasks and start the queue', () => {
		const addedCount = queue.addTasks({ year: 2023, month: 1 }, { year: 2023, month: 1 }, [
			'weight',
			'activity'
		]);
		const state = get(queue.tasks);

		expect(addedCount).toBe(2);
		expect(state.tasks.length).toBe(2);
		expect(state.tasks[0].id).toBe('weight-2023-1');
		expect(state.tasks[1].id).toBe('activity-2023-1');
		expect(state.status).toBe('running');
	});

	it('should not add duplicate tasks', () => {
		queue.addTasks({ year: 2023, month: 1 }, { year: 2023, month: 1 }, ['weight']);
		const addedCount = queue.addTasks({ year: 2023, month: 1 }, { year: 2023, month: 1 }, [
			'weight'
		]);
		const state = get(queue.tasks);

		expect(addedCount).toBe(0);
		expect(state.tasks.length).toBe(1);
	});

	it('should process tasks in the correct order', async () => {
		queue.addTasks({ year: 2023, month: 2 }, { year: 2023, month: 2 }, ['tcx']);
		queue.addTasks({ year: 2023, month: 1 }, { year: 2023, month: 1 }, ['weight']);
		queue.addTasks({ year: 2023, month: 1 }, { year: 2023, month: 1 }, ['activity']);

		const state = get(queue.tasks);
		expect(state.tasks.map((t) => t.id)).toEqual([
			'weight-2023-1',
			'activity-2023-1',
			'tcx-2023-2'
		]);

		const firstTask = state.tasks[0] as unknown as Task & { run: Mock };
		const secondTask = state.tasks[1] as unknown as Task & { run: Mock };

		await vi.runAllTimersAsync();

		expect(firstTask.run).toHaveBeenCalled();
		expect(secondTask.run).toHaveBeenCalled();
		expect(state.tasks[0].status).toBe('completed');
	});

	it('should stop when the queue is empty', async () => {
		queue.addTasks({ year: 2023, month: 1 }, { year: 2023, month: 1 }, ['weight']);
		await vi.runAllTimersAsync(); // Process the task
		const state = get(queue.tasks);
		expect(state.status).toBe('idle');
	});

	it('should retry a failed task', async () => {
		queue.addTasks({ year: 2023, month: 1 }, { year: 2023, month: 1 }, ['weight']);
		const task = get(queue.tasks).tasks[0];
		task.status = 'failed';

		queue.retryTask(task.id);

		expect(task.status).toBe('pending');
		expect(get(queue.tasks).status).toBe('running');
	});

	it('should generate a zip file', async () => {
		queue.addTasks({ year: 2023, month: 1 }, { year: 2023, month: 1 }, ['weight']);
		await vi.runAllTimersAsync(); // Complete the task

		const blob = await queue.generateZip();
		expect(blob).toBeInstanceOf(Blob);
		expect(JSZip).toHaveBeenCalled();
		expect(mockZipInstance.file).toHaveBeenCalledWith(expect.any(String), expect.any(Blob));
		expect(mockZipInstance.generateAsync).toHaveBeenCalledWith({ type: 'blob' });
	});

	it('should erase all data', async () => {
		queue.addTasks({ year: 2023, month: 1 }, { year: 2023, month: 1 }, ['weight']);
		await queue.eraseData();
		const state = get(queue.tasks);
		expect(state.tasks.length).toBe(0);
		expect(idbKeyval.del).toHaveBeenCalledWith('download-queue');
	});
});
