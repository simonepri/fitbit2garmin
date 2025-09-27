import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WeightTask, ActivityTask, TcxTask, Task } from './tasks';
import * as fitbitApi from './fitbit-api';
import type { Mock } from 'vitest';

vi.mock('./fitbit-api', () => ({
	apiFetch: vi.fn()
}));

const mockedApiFetch = fitbitApi.apiFetch as Mock;

describe('Tasks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(performance, 'now').mockReturnValue(0);
	});

	describe('WeightTask', () => {
		it('should download and process weight data', async () => {
			const task = new WeightTask(2023, 5);
			const mockApiResponse = {
				json: () =>
					Promise.resolve({
						weight: [
							{ date: '2023-05-01', weight: 70, bmi: 22, fat: 15 },
							{ date: '2023-05-15', weight: 69.5, bmi: 21.8, fat: 14.8 }
						]
					})
			};
			mockedApiFetch.mockResolvedValue(mockApiResponse as Response);

			await task.run();

			expect(task.status).toBe('completed');
			expect(task.files.length).toBe(1);
			expect(task.files[0].name).toBe('weight-2023-5.csv');
			expect(task.files[0].content).toContain('2023-05-01,70,22,15');
			expect(task.progress.completed).toBe(1);
		});

		it('should handle empty weight data', async () => {
			const task = new WeightTask(2023, 5);
			const mockApiResponse = {
				json: () => Promise.resolve({ weight: [] })
			};
			mockedApiFetch.mockResolvedValue(mockApiResponse as Response);

			await task.run();

			expect(task.status).toBe('completed');
			expect(task.files.length).toBe(0);
			expect(task.progress.empty).toBe(1);
		});

		it('should handle API errors', async () => {
			const task = new WeightTask(2023, 5);
			mockedApiFetch.mockRejectedValue(new Error('API Error'));

			await task.run();

			expect(task.status).toBe('failed');
			expect(task.lastError).toBe('API Error');
			expect(task.progress.failed).toBe(1);
		});
	});

	describe('ActivityTask', () => {
		it('should download and process activity data', async () => {
			const task = new ActivityTask(2023, 5);
			mockedApiFetch.mockImplementation((path: string) => {
				const resource = path.split('/')[4];
				return Promise.resolve({
					json: () =>
						Promise.resolve({
							[`activities-${resource}`]: [{ dateTime: '2023-05-01', value: '100' }]
						})
				} as Response);
			});

			await task.run();

			expect(task.status).toBe('completed');
			expect(task.files.length).toBe(1);
			expect(task.files[0].name).toBe('activity-2023-5.csv');
			expect(task.progress.completed).toBe(1);
		});
	});

	describe('TcxTask', () => {
		const mockTcxFile = {
			text: () =>
				Promise.resolve(
					'<?xml version="1.0" encoding="UTF-8"?>\n<TrainingCenterDatabase>...\n</TrainingCenterDatabase>\n'.repeat(
						6
					)
				)
		};

		const mockActivityList = {
			json: () =>
				Promise.resolve({
					activities: [
						{ logId: 1, startTime: '2023-05-01T10:00:00.000' },
						{ logId: 2, startTime: '2023-05-02T10:00:00.000' }
					],
					pagination: { next: '' }
				})
		};

		it('should download and process TCX data', async () => {
			const task = new TcxTask(2023, 5);
			mockedApiFetch.mockImplementation((path: string) => {
				if (path.includes('list.json')) {
					return Promise.resolve(mockActivityList as Response);
				}
				return Promise.resolve(mockTcxFile as Response);
			});

			await task.run();

			expect(task.status).toBe('completed');
			expect(task.progress.total).toBe(2);
			expect(task.progress.completed).toBe(2);
			expect(task.files.length).toBe(2);
			expect(task.files[0].name).toContain('tcx-2023-5-1.tcx');
		});

		it('should handle retry logic correctly', async () => {
			const task = new TcxTask(2023, 5);
			task.files.push({ name: 'tcx-2023-5-1.tcx', content: 'dummy' });

			mockedApiFetch.mockImplementation((path: string) => {
				if (path.includes('list.json')) {
					return Promise.resolve(mockActivityList as Response);
				}
				if (path.includes('2.tcx')) {
					return Promise.resolve(mockTcxFile as Response);
				}
				return Promise.reject(new Error('Should not be called'));
			});

			await task.run();

			expect(fitbitApi.apiFetch).toHaveBeenCalledTimes(2);
			expect(fitbitApi.apiFetch).toHaveBeenCalledWith(
				expect.stringContaining('activities/list.json')
			);
			expect(fitbitApi.apiFetch).toHaveBeenCalledWith(expect.stringContaining('activities/2.tcx'));
			expect(fitbitApi.apiFetch).not.toHaveBeenCalledWith(
				expect.stringContaining('activities/1.tcx')
			);

			expect(task.status).toBe('completed');
			expect(task.progress.completed).toBe(1); // Only one new file
			expect(task.files.length).toBe(2);
		});

		it('should handle failed TCX downloads', async () => {
			const task = new TcxTask(2023, 5);
			mockedApiFetch.mockImplementation((path: string) => {
				if (path.includes('list.json')) {
					return Promise.resolve(mockActivityList as Response);
				}
				if (path.includes('1.tcx')) {
					return Promise.resolve(mockTcxFile as Response);
				}
				return Promise.reject(new Error('Failed to download'));
			});

			await task.run();

			expect(task.status).toBe('failed');
			expect(task.progress.completed).toBe(1);
			expect(task.progress.failed).toBe(1);
			expect(task.lastError).toContain('Failed to download log 2');
		});
	});

	describe('Task serialization', () => {
		it('should serialize and deserialize a task correctly', () => {
			const originalTask = new WeightTask(2023, 5);
			originalTask.status = 'completed';
			originalTask.runtime = 1234;
			originalTask.files.push({ name: 'test.csv', content: 'a,b,c' });

			const json = originalTask.toJSON();
			const restoredTask = Task.fromJSON(json);

			expect(restoredTask).toBeInstanceOf(WeightTask);
			expect(restoredTask.id).toBe(originalTask.id);
			expect(restoredTask.status).toBe(originalTask.status);
			expect(restoredTask.runtime).toBe(originalTask.runtime);
			expect(restoredTask.files[0].name).toBe('test.csv');
		});
	});
});
