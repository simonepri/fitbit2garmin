import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WeightTask, ActivityTask, TcxTask, Task } from './tasks';
import type { FitbitApi } from './fitbit-api';

// Mock performance.now() for timer tests
let time = 1; // Start at a non-zero value
vi.stubGlobal('performance', {
	now: () => time
});

// Mock FitbitApi
const mockApi = {
	apiFetch: vi.fn()
} as unknown as FitbitApi;

describe('Task', () => {
	class TestTask extends Task {
		constructor(year: number, month: number) {
			super('weight', year, month);
		}
		async run(): Promise<void> {
			this.status = 'completed';
		}
	}

	beforeEach(() => {
		time = 1;
	});

	it('should correctly calculate runtime', () => {
		const task = new TestTask(2023, 1);
		expect(task.runtime).toBe(0);

		task.startTimer(); // timerStart = 1
		time = 101;
		task.stopTimer(); // runtime += 101 - 1 = 100
		expect(task.runtime).toBe(100);

		task.startTimer(); // timerStart = 101
		time = 251;
		task.stopTimer(); // runtime becomes 100 + (251 - 101) = 250
		expect(task.runtime).toBe(250);
	});

	it('should serialize to JSON without file content', () => {
		const task = new TestTask(2023, 1);
		task.files = [{ id: 'file1', status: 'completed', content: new Blob(['test']) }];
		const json = task.toJSON();
		expect(json.id).toBe('weight-2023-1');
		expect(json.files[0].content).toBeUndefined();
	});
});

describe('WeightTask', () => {
	let task: WeightTask;

	beforeEach(() => {
		task = new WeightTask(2023, 5);
		vi.mocked(mockApi.apiFetch).mockClear();
	});

	it('should run successfully and create a CSV', async () => {
		vi.mocked(mockApi.apiFetch).mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					weight: [{ date: '2023-05-10', weight: 70, bmi: 22, fat: 15 }]
				}),
				{ status: 200 }
			)
		);

		await task.run(mockApi);

		expect(task.status).toBe('completed');
		expect(task.files[0].status).toBe('completed');
		expect(task.files[0].content).toBeInstanceOf(Blob);
		const content = await (task.files[0].content as Blob).text();
		expect(content).toContain('2023-05-10,70,22,15');
	});

	it('should handle empty weight data', async () => {
		vi.mocked(mockApi.apiFetch).mockResolvedValueOnce(
			new Response(JSON.stringify({ weight: [] }), { status: 200 })
		);
		await task.run(mockApi);
		expect(task.status).toBe('completed');
		expect(task.files[0].status).toBe('empty');
	});

	it('should handle API failure', async () => {
		vi.mocked(mockApi.apiFetch).mockRejectedValueOnce(new Error('API Error'));
		await task.run(mockApi);
		expect(task.status).toBe('failed');
		expect(task.files[0].status).toBe('failed');
	});
});

describe('ActivityTask', () => {
	let task: ActivityTask;

	beforeEach(() => {
		task = new ActivityTask(2023, 5);
		vi.mocked(mockApi.apiFetch).mockClear();
	});

	it('should run successfully and create a CSV', async () => {
		vi.mocked(mockApi.apiFetch)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({ 'activities-calories': [{ dateTime: '2023-05-10', value: '2500' }] })
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({ 'activities-steps': [{ dateTime: '2023-05-10', value: '8000' }] })
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({ 'activities-distance': [{ dateTime: '2023-05-10', value: '6.5' }] })
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({ 'activities-floors': [{ dateTime: '2023-05-10', value: '10' }] })
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						'activities-minutesSedentary': [{ dateTime: '2023-05-10', value: '500' }]
					})
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						'activities-minutesLightlyActive': [{ dateTime: '2023-05-10', value: '120' }]
					})
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						'activities-minutesFairlyActive': [{ dateTime: '2023-05-10', value: '30' }]
					})
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						'activities-minutesVeryActive': [{ dateTime: '2023-05-10', value: '45' }]
					})
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						'activities-activityCalories': [{ dateTime: '2023-05-10', value: '800' }]
					})
				)
			);

		await task.run(mockApi);

		expect(task.status).toBe('completed');
		expect(task.files[0].status).toBe('completed');
		const content = await (task.files[0].content as Blob).text();
		expect(content).toContain('2023-05-10,2500,8000,6.5,10,500,120,30,45,800');
	});
});

describe('TcxTask', () => {
	let task: TcxTask;

	beforeEach(() => {
		task = new TcxTask(2023, 5);
		vi.mocked(mockApi.apiFetch).mockClear();
	});

	it('should populate files and then download them', async () => {
		// Mock for populateFiles and subsequent downloads
		vi.mocked(mockApi.apiFetch)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						activities: [
							{ logId: 123, logType: 'run', startTime: '2023-05-10T10:00:00.000' },
							{ logId: 456, logType: 'walk', startTime: '2023-05-11T12:00:00.000' },
							{ logId: 789, logType: 'auto_detected', startTime: '2023-05-12T14:00:00.000' } // Should be filtered out
						]
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(new Response('<tcx>run data</tcx>\n'.repeat(20), { status: 200 })) // for logId 123
			.mockResolvedValueOnce(new Response('<tcx>walk data</tcx>\n'.repeat(20), { status: 200 })); // for logId 456

		await task.run(mockApi);

		expect(task.status).toBe('completed');
		expect(task.files.length).toBe(2);
		expect(task.files[0].id).toBe('123');
		expect(task.files[0].status).toBe('completed');
		expect(task.files[1].id).toBe('456');
		expect(task.files[1].status).toBe('completed');
		expect(vi.mocked(mockApi.apiFetch)).toHaveBeenCalledTimes(3); // 1 for list, 2 for tcx
	});

	it('should handle failed TCX downloads and allow retry', async () => {
		task.files = [
			{ id: '123', status: 'pending' },
			{ id: '456', status: 'failed' },
			{ id: '789', status: 'completed', content: new Blob() }
		];

		// Mock failing for the first file and succeeding for the second (retried) one
		vi.mocked(mockApi.apiFetch)
			.mockRejectedValueOnce(new Error('Network Error')) // for logId 123
			.mockResolvedValueOnce(
				new Response('<tcx>walk data retried</tcx>\n'.repeat(20), { status: 200 })
			); // for logId 456

		await task.run(mockApi);

		expect(task.status).toBe('failed');
		expect(task.files[0].status).toBe('failed');
		expect(task.files[1].status).toBe('completed');
		expect(task.files[2].status).toBe('completed'); // Should not be re-fetched
		expect(vi.mocked(mockApi.apiFetch)).toHaveBeenCalledTimes(2);
	});
});
