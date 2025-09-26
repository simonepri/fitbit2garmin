import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Task, WeightTask, ActivityTask, TCXTask } from './tasks';
import type { FitbitAPI } from './fitbit-api';
import type { SerializedTask } from './types';

// Mock performance.now()
vi.stubGlobal('performance', {
	now: vi.fn().mockReturnValue(0)
});

// Mock FitbitAPI
const mockApiCall = vi.fn();
const mockFitbitApi = {
	apiCall: mockApiCall
} as unknown as FitbitAPI;

describe('Tasks', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.mock('uuid', () => ({ v4: () => 'test-id' }));
		mockApiCall.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	describe('Base Task', () => {
		class TestTask extends Task {
			constructor() {
				super('weight', 2023, 1);
			}
			async run() {}
		}

		it('should initialize correctly', () => {
			const task = new TestTask();
			expect(task.id).toBe('test-id');
			expect(task.status).toBe('pending');
			expect(task.runtime).toBe(0);
		});

		it('should track runtime', () => {
			const task = new TestTask();
			const performance = vi.spyOn(global.performance, 'now');

			performance.mockReturnValue(100);
			task.startTimer();

			performance.mockReturnValue(250);
			task.stopTimer();

			expect(task.runtime).toBe(150);
		});

		it('should calculate file counts', () => {
			const task = new TestTask();
			task.files = [
				{ name: 'a', blob: new Blob(), status: 'completed' },
				{ name: 'b', blob: null, status: 'completed' },
				{ name: 'c', blob: null, status: 'failed' },
				{ name: 'd', blob: null, status: 'pending' }
			];
			expect(task.totalFiles).toBe(4);
			expect(task.completedFiles).toBe(2);
			expect(task.failedFiles).toBe(1);
			expect(task.emptyFiles).toBe(1);
		});

		it('should serialize to JSON', () => {
			const task = new TestTask();
			const json = task.toJSON();
			expect(json.id).toBe('test-id');
			expect(json.files).toEqual([]);
		});

		it('should deserialize from JSON', () => {
			const json: SerializedTask = {
				type: 'weight',
				year: 2023,
				month: 1,
				id: 'test-id',
				status: 'pending',
				runtime: 0,
				files: [],
				createdAt: Date.now(),
				updatedAt: Date.now()
			};
			const task = Task.fromJSON(json);
			expect(task).toBeInstanceOf(WeightTask);
			expect(task.id).toBe('test-id');
		});
	});

	describe('WeightTask', () => {
		it('should run and create a csv', async () => {
			const task = new WeightTask(2023, 1);
			const mockResponse = {
				weight: [{ date: '2023-01-01', weight: 80 }]
			};
			mockApiCall.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockResponse)
			});

			await task.run(mockFitbitApi);

			expect(task.files[0].status).toBe('completed');
			expect(task.files[0].blob).toBeInstanceOf(Blob);
			const text = await task.files[0].blob!.text();
			expect(text).toContain('2023-01-01,80');
		});
	});

	describe('ActivityTask', () => {
		it('should run and create a csv', async () => {
			const task = new ActivityTask(2023, 1);
			const mockResponse = {
				activities: [
					{
						startTime: '2023-01-15T10:00:00.000',
						activityName: 'Running',
						calories: 300,
						steps: 3000,
						distance: 3.5
					}
				],
				pagination: { next: '' }
			};
			mockApiCall.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockResponse)
			});

			await task.run(mockFitbitApi);

			expect(task.files[0].status).toBe('completed');
			expect(task.files[0].blob).toBeInstanceOf(Blob);
			const text = await task.files[0].blob!.text();
			expect(text).toContain('2023-01-15,Running,300,3000,3.5');
		});
	});

	describe('TCXTask', () => {
		it('should discover and download tcx files', async () => {
			const task = new TCXTask(2023, 1);
			const mockDiscoveryResponse = {
				activities: [
					{ startTime: '2023-01-20T12:00:00.000', logId: 12345 },
					{ startTime: '2023-02-01T12:00:00.000', logId: 67890 } // Should be filtered out
				],
				pagination: { next: '' }
			};
			const mockTcxResponse = '<tcx>data</tcx>';

			mockApiCall
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(mockDiscoveryResponse)
				})
				.mockResolvedValueOnce({
					ok: true,
					text: () => Promise.resolve(mockTcxResponse)
				});

			await task.run(mockFitbitApi);

			expect(task.files.length).toBe(1);
			expect(task.files[0].name).toBe('tcx-2023-01-12345.tcx');
			expect(task.files[0].status).toBe('completed');
			expect(task.files[0].blob).toBeInstanceOf(Blob);
			const text = await task.files[0].blob!.text();
			expect(text).toBe('<tcx>data</tcx>');
		});

		it('should handle paginated discovery', async () => {
			const task = new TCXTask(2023, 1);
			const mockPage1Response = {
				activities: [{ startTime: '2023-01-10T12:00:00.000', logId: 11111 }],
				pagination: {
					next: 'https://api.fitbit.com/1/user/-/activities/list.json?offset=1&limit=1'
				}
			};
			const mockPage2Response = {
				activities: [{ startTime: '2023-01-20T12:00:00.000', logId: 22222 }],
				pagination: { next: '' }
			};

			mockApiCall
				.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockPage1Response) })
				.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockPage2Response) });

			await (task as any).discoverFiles(mockFitbitApi);

			expect(mockApiCall).toHaveBeenCalledTimes(2);
			expect(mockApiCall).toHaveBeenCalledWith(
				'/1/user/-/activities/list.json?afterDate=2023-01-01&offset=0&limit=100&sort=asc'
			);
			expect(mockApiCall).toHaveBeenCalledWith('/1/user/-/activities/list.json?offset=1&limit=1');
			expect(task.files.length).toBe(2);
			expect(task.files[0].name).toContain('11111');
			expect(task.files[1].name).toContain('22222');
		});

		it('should only retry failed files', async () => {
			const task = new TCXTask(2023, 1);
			task.files = [
				{ name: 'tcx-2023-01-1.tcx', blob: new Blob(), status: 'completed' },
				{ name: 'tcx-2023-01-2.tcx', blob: null, status: 'failed' }
			];

			mockApiCall.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve('<tcx>retried</tcx>')
			});

			await task.run(mockFitbitApi);

			expect(mockApiCall).toHaveBeenCalledTimes(1);
			expect(mockApiCall).toHaveBeenCalledWith('/1/user/-/activities/2.tcx');
			expect(task.files[1].status).toBe('completed');
			const text = await task.files[1].blob!.text();
			expect(text).toBe('<tcx>retried</tcx>');
		});
	});
});
