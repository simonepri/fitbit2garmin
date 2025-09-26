import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { TaskQueue } from './queue';
import { WeightTask, ActivityTask, TCXTask } from './tasks';
import type { FitbitAPI } from './fitbit-api';
import { get } from 'svelte/store';
import JSZip from 'jszip';
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';

// Mock all dependencies at the top level
vi.mock('idb-keyval', async () => {
	const actual = await vi.importActual('idb-keyval');
	return {
		...actual,
		get: vi.fn(),
		set: vi.fn(),
		del: vi.fn(),
		keys: vi.fn(),
		createStore: vi.fn(() => ({}))
	};
});
vi.mock('jszip');
vi.mock('uuid', () => ({ v4: () => `mock-uuid-${Math.random()}` }));

// Mock FitbitAPI
const mockFitbitApi = {
	apiCall: vi.fn()
} as unknown as FitbitAPI;

describe('TaskQueue', () => {
	let queue: TaskQueue;
	let processQueueSpy: any;

	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks();

		// Default mock implementations
		vi.mocked(idbKeys).mockResolvedValue([]);
		vi.mocked(idbGet).mockResolvedValue(null);
		(mockFitbitApi.apiCall as Mock).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ weight: [], activities: [] }),
			text: () => Promise.resolve('')
		});

		queue = new TaskQueue(mockFitbitApi);
		// Spy on processQueue to prevent it from running automatically
		processQueueSpy = vi
			.spyOn(queue, 'processQueue' as any)
			.mockImplementation(() => Promise.resolve());
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should init and clear old data if user changes', async () => {
		vi.mocked(idbGet).mockResolvedValueOnce('old-user-id');
		// Mock keys for both task and blob stores
		vi.mocked(idbKeys).mockResolvedValueOnce(['task1']).mockResolvedValueOnce(['blob1']);

		await queue.init('new-user-id');

		expect(idbDel).toHaveBeenCalledWith('task1', expect.any(Object));
		expect(idbDel).toHaveBeenCalledWith('blob1', expect.any(Object));
		expect(idbDel).toHaveBeenCalledWith('userId');
		expect(idbSet).toHaveBeenCalledWith('userId', 'new-user-id');
	});

	it('should load existing tasks on init', async () => {
		const taskJson = new WeightTask(2023, 1).toJSON();
		vi.mocked(idbGet).mockResolvedValueOnce('test-user-id').mockResolvedValue(taskJson);
		vi.mocked(idbKeys).mockResolvedValue([taskJson.id]);

		await queue.init('test-user-id');

		expect(get(queue.tasks).length).toBe(1);
		expect(get(queue.tasks)[0].id).toBe(taskJson.id);
	});

	it('should add new tasks and prevent all duplicates', async () => {
		await queue.init('test-user-id');
		const task1 = new WeightTask(2023, 1);
		const task2 = new ActivityTask(2023, 1);
		const task3 = new WeightTask(2023, 1); // Duplicate of task1

		// Add one task first
		await queue.addTasks([task1]);
		expect(get(queue.tasks).length).toBe(1);

		// Add more, including a duplicate of the existing and a new one
		const addedCount = await queue.addTasks([task2, task3]);

		expect(addedCount).toBe(1); // Only task2 should be added
		expect(get(queue.tasks).length).toBe(2);
		expect(processQueueSpy).toHaveBeenCalledTimes(3); // init + 2x addTasks
	});

	it('should process tasks in priority order', async () => {
		const task1 = new WeightTask(2023, 2); // 3rd
		const task2 = new TCXTask(2023, 1); // 2nd
		const task3 = new WeightTask(2023, 1); // 1st

		await queue.init('test-user-id');
		await queue.addTasks([task1, task2, task3]);

		// Restore original processQueue to test the real implementation
		processQueueSpy.mockRestore();

		// Spy on the actual run methods of the task subclasses
		const weightRunSpy = vi.spyOn(WeightTask.prototype, 'run').mockResolvedValue();
		const tcxRunSpy = vi.spyOn(TCXTask.prototype, 'run').mockResolvedValue();

		// Manually trigger the queue processing loop
		await (queue as any).processQueue(); // Process first task
		await (queue as any).processQueue(); // Process second task
		await (queue as any).processQueue(); // Process third task

		const sortedTasks = get(queue.tasks);
		expect(sortedTasks[0].type).toBe('weight');
		expect(sortedTasks[0].month).toBe(1);
		expect(sortedTasks[1].type).toBe('tcx');
		expect(sortedTasks[2].type).toBe('weight');
		expect(sortedTasks[2].month).toBe(2);

		expect(weightRunSpy).toHaveBeenCalledTimes(2);
		expect(tcxRunSpy).toHaveBeenCalledTimes(1);
	});

	it('should retry failed tasks and leave completed files alone', async () => {
		await queue.init('test-user-id');
		const task = new TCXTask(2023, 1);
		task.status = 'failed';
		task.files = [
			{ name: 'a', blob: new Blob(), status: 'completed' },
			{ name: 'b', blob: null, status: 'failed' }
		];
		queue.tasks.set([task]);

		await queue.retryTask(task.id);

		const updatedTask = get(queue.tasks)[0];
		expect(updatedTask.status).toBe('pending');
		expect(updatedTask.files[0].status).toBe('completed'); // Should not change
		expect(updatedTask.files[1].status).toBe('pending'); // Should be reset
		expect(processQueueSpy).toHaveBeenCalled();
	});

	it('should generate a zip file with correct structure', async () => {
		await queue.init('test-user-id');
		const task = new WeightTask(2023, 1);
		task.status = 'completed';
		task.files[0].status = 'completed';
		task.files[0].blob = new Blob(['test-data']);
		queue.tasks.set([task]);

		const mockZipFile = vi.fn();
		const mockGenerateAsync = vi.fn().mockResolvedValue(new Blob(['zip-content']));
		vi.mocked(JSZip).mockImplementation(
			() => ({ file: mockZipFile, generateAsync: mockGenerateAsync }) as unknown as JSZip
		);

		const zipBlob = await queue.downloadCompleted();

		expect(mockZipFile).toHaveBeenCalledWith('2023-01/weight-2023-01.csv', expect.any(Blob));
		expect(zipBlob?.size).toBeGreaterThan(0);
	});

	it('should clear all data correctly', async () => {
		await queue.init('test-user-id');
		queue.tasks.set([new WeightTask(2023, 1)]);

		vi.mocked(idbKeys).mockResolvedValueOnce(['task1']).mockResolvedValueOnce(['blob1']);
		await queue.clearAllData();

		expect(idbDel).toHaveBeenCalledWith('task1', expect.any(Object));
		expect(idbDel).toHaveBeenCalledWith('blob1', expect.any(Object));
		expect(idbDel).toHaveBeenCalledWith('userId');
		expect(get(queue.tasks).length).toBe(0);
	});
});
