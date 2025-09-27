import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WeightTask, ActivityTask, TcxTask, TaskStatus, DataType, type TaskState } from './tasks';
import { FitbitAPI } from './fitbit-api';

// Mock performance.now()
vi.stubGlobal('performance', {
	now: vi.fn().mockReturnValue(0)
});

// Mock FitbitAPI
vi.mock('./fitbit-api', () => {
	const FitbitAPI = vi.fn();
	FitbitAPI.prototype.getWeightLogs = vi.fn();
	FitbitAPI.prototype.getActivityTimeSeries = vi.fn();
	FitbitAPI.prototype.getActivityLogs = vi.fn();
	FitbitAPI.prototype.getActivityTCX = vi.fn();
	return { FitbitAPI };
});

describe('Task Management', () => {
	let mockFitbitApi: FitbitAPI;

	beforeEach(() => {
		mockFitbitApi = new FitbitAPI();
		vi.clearAllMocks();
	});

	describe('WeightTask', () => {
		it('should create a weight task and run it successfully', async () => {
			const state: TaskState = {
				id: 'weight-2023-01',
				type: DataType.Weight,
				year: 2023,
				month: 1,
				status: TaskStatus.Pending,
				runtime: 0,
				files: []
			};

			const task = new WeightTask(state);
			expect(task.state.files.length).toBe(1);

			vi.mocked(mockFitbitApi.getWeightLogs).mockResolvedValue({
				weight: [
					{ date: '2023-01-15', weight: 70, bmi: 22, fat: 15, logId: 1, time: 't', source: 's' }
				]
			});

			await task.run(mockFitbitApi);

			expect(task.status).toBe(TaskStatus.Completed);
			expect(task.state.files[0].status).toBe('completed');
			expect(task.state.files[0].content).toContain('Date,Weight,BMI,Fat');
		});

		it('should handle empty weight data', async () => {
			const state: TaskState = {
				id: 'weight-2023-02',
				type: DataType.Weight,
				year: 2023,
				month: 2,
				status: TaskStatus.Pending,
				runtime: 0,
				files: []
			};
			const task = new WeightTask(state);
			vi.mocked(mockFitbitApi.getWeightLogs).mockResolvedValue({ weight: [] });
			await task.run(mockFitbitApi);
			expect(task.status).toBe(TaskStatus.Completed);
			expect(task.state.files[0].status).toBe('empty');
		});
	});

	describe('ActivityTask', () => {
		it('should create an activity task and run it successfully', async () => {
			const state: TaskState = {
				id: 'activity-2023-01',
				type: DataType.Activity,
				year: 2023,
				month: 1,
				status: TaskStatus.Pending,
				runtime: 0,
				files: []
			};

			const task = new ActivityTask(state);

			vi.mocked(mockFitbitApi.getActivityTimeSeries).mockImplementation((resource: string) => {
				return Promise.resolve({
					[`activities-${resource}`]: [{ dateTime: '2023-01-15', value: '100' }]
				});
			});

			await task.run(mockFitbitApi);

			expect(task.status).toBe(TaskStatus.Completed);
			expect(task.state.files[0].status).toBe('completed');
			expect(task.state.files[0].content).toContain('Date,Calories Burned,Steps');
		});
	});

	describe('TcxTask', () => {
		it('should fetch activity list and then download TCX files', async () => {
			const state: TaskState = {
				id: 'tcx-2023-01',
				type: DataType.TCX,
				year: 2023,
				month: 1,
				status: TaskStatus.Pending,
				runtime: 0,
				files: []
			};

			const task = new TcxTask(state);

			vi.mocked(mockFitbitApi.getActivityLogs).mockResolvedValue({
				activities: [
					{ logId: 1, originalStartTime: '2023-01-10T10:00:00.000', logType: 'manual' },
					{
						logId: 2,
						originalStartTime: '2023-01-12T12:00:00.000',
						logType: 'auto_detected'
					}
				]
			});

			vi.mocked(mockFitbitApi.getActivityTCX).mockImplementation((logId: number) => {
				if (logId === 1) {
					// Generate a string with more than 15 lines to pass the check
					return Promise.resolve('line\n'.repeat(20));
				}
				return Promise.reject('Not found');
			});

			await task.run(mockFitbitApi);

			expect(task.status).toBe(TaskStatus.Completed);
			expect(task.state.files.length).toBe(2);
			expect(task.state.files.find((f) => f.id === '1')?.status).toBe('completed');
			expect(task.state.files.find((f) => f.id === '2')?.status).toBe('empty');
		});
	});

	describe('Task error handling and retry', () => {
		it('should set status to failed on error', async () => {
			const state: TaskState = {
				id: 'weight-2023-03',
				type: DataType.Weight,
				year: 2023,
				month: 3,
				status: TaskStatus.Pending,
				runtime: 0,
				files: []
			};
			const task = new WeightTask(state);
			vi.mocked(mockFitbitApi.getWeightLogs).mockRejectedValue(new Error('API Error'));

			await task.run(mockFitbitApi);

			expect(task.status).toBe(TaskStatus.Failed);
			expect(task.state.error).toBe('API Error');
		});

		it('should allow retrying a failed task', async () => {
			const state: TaskState = {
				id: 'weight-2023-04',
				type: DataType.Weight,
				year: 2023,
				month: 4,
				status: TaskStatus.Failed,
				runtime: 100,
				files: [{ id: '2023-04', status: 'failed' }],
				error: 'Initial error'
			};
			const task = new WeightTask(state);
			task.retry();

			expect(task.status).toBe(TaskStatus.Pending);
			expect(task.state.error).toBeUndefined();
			expect(task.state.files[0].status).toBe('pending');
		});
	});
});
