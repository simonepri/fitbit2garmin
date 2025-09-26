import type { FitbitAPI } from './fitbit-api';
import type {
	TaskStatus,
	DataType,
	TaskFile,
	SerializedTask,
	FitbitWeightResponse,
	FitbitPaginatedActivityResponse
} from './types';
import { v4 as uuidv4 } from 'uuid';

// Abstract Task class
export abstract class Task {
	id: string;
	type: DataType;
	status: TaskStatus;
	year: number;
	month: number;
	runtime: number;
	files: TaskFile[];
	createdAt: number;
	updatedAt: number;

	private startTime: number | null = null;

	constructor(type: DataType, year: number, month: number) {
		this.id = uuidv4();
		this.type = type;
		this.status = 'pending';
		this.year = year;
		this.month = month;
		this.runtime = 0;
		this.files = [];
		this.createdAt = Date.now();
		this.updatedAt = Date.now();
	}

	abstract run(fitbitApi: FitbitAPI): Promise<void>;

	startTimer(): void {
		this.startTime = performance.now();
	}

	stopTimer(): void {
		if (this.startTime) {
			this.runtime += performance.now() - this.startTime;
			this.startTime = null;
		}
	}

	get totalFiles(): number {
		return this.files.length;
	}

	get completedFiles(): number {
		return this.files.filter((f) => f.status === 'completed').length;
	}

	get failedFiles(): number {
		return this.files.filter((f) => f.status === 'failed').length;
	}

	get emptyFiles(): number {
		return this.files.filter((f) => f.blob === null && f.status === 'completed').length;
	}

	toJSON(): SerializedTask {
		return {
			id: this.id,
			type: this.type,
			status: this.status,
			year: this.year,
			month: this.month,
			runtime: this.runtime,
			files: this.files.map((f) => ({ ...f, blob: null })), // Don't serialize blobs
			createdAt: this.createdAt,
			updatedAt: this.updatedAt
		};
	}

	static fromJSON(json: SerializedTask): Task {
		let task: Task;
		switch (json.type) {
			case 'weight':
				task = new WeightTask(json.year, json.month);
				break;
			case 'activity':
				task = new ActivityTask(json.year, json.month);
				break;
			case 'tcx':
				task = new TCXTask(json.year, json.month);
				break;
			default:
				throw new Error(`Unknown task type: ${json.type}`);
		}
		// This is not ideal, but it's a simple way to re-hydrate the object
		Object.assign(task, { ...json, files: json.files.map((f) => ({ ...f, blob: null })) });
		return task;
	}
}

// Weight Task
export class WeightTask extends Task {
	constructor(year: number, month: number) {
		super('weight', year, month);
		this.files = [
			{
				name: `weight-${year}-${String(month).padStart(2, '0')}.csv`,
				blob: null,
				status: 'pending'
			}
		];
	}

	async run(fitbitApi: FitbitAPI): Promise<void> {
		const startDate = new Date(this.year, this.month - 1, 1);
		const endDate = new Date(this.year, this.month, 0);
		const url = `/1/user/-/body/log/weight/date/${startDate.toISOString().split('T')[0]}/${
			endDate.toISOString().split('T')[0]
		}.json`;

		const res = await fitbitApi.apiCall(url);
		if (!res.ok) throw new Error('Failed to fetch weight data');

		const data = (await res.json()) as FitbitWeightResponse;
		const file = this.files[0];

		if (data.weight.length > 0) {
			const csv = 'Date,Weight (kg)\n' + data.weight.map((d) => `${d.date},${d.weight}`).join('\n');
			file.blob = new Blob([csv], { type: 'text/csv' });
		}
		file.status = 'completed';
	}
}

// Activity Task
export class ActivityTask extends Task {
	constructor(year: number, month: number) {
		super('activity', year, month);
		this.files = [
			{
				name: `activity-${year}-${String(month).padStart(2, '0')}.csv`,
				blob: null,
				status: 'pending'
			}
		];
	}

	async run(fitbitApi: FitbitAPI): Promise<void> {
		const allActivities = [];
		let nextUrl: string | undefined = `/1/user/-/activities/list.json?afterDate=${
			new Date(this.year, this.month - 1, 1).toISOString().split('T')[0]
		}&offset=0&limit=100&sort=asc`;

		while (nextUrl) {
			const res = await fitbitApi.apiCall(nextUrl);
			if (!res.ok) throw new Error('Failed to fetch activity data');

			const data = (await res.json()) as FitbitPaginatedActivityResponse;
			allActivities.push(...data.activities);
			nextUrl = data.pagination.next
				? new URL(data.pagination.next).pathname + new URL(data.pagination.next).search
				: undefined;
		}

		const file = this.files[0];
		const activitiesInMonth = allActivities.filter(
			(a) => new Date(a.startTime).getMonth() === this.month - 1
		);

		if (activitiesInMonth.length > 0) {
			const csv =
				'Date,Activity,Calories,Steps,Distance (km)\n' +
				activitiesInMonth
					.map(
						(a) =>
							`${a.startTime.split('T')[0]},${a.activityName},${a.calories},${a.steps || 0},${
								a.distance || 0
							}`
					)
					.join('\n');
			file.blob = new Blob([csv], { type: 'text/csv' });
		}
		file.status = 'completed';
	}
}

// TCX Task
export class TCXTask extends Task {
	constructor(year: number, month: number) {
		super('tcx', year, month);
	}

	async run(fitbitApi: FitbitAPI): Promise<void> {
		if (this.files.length === 0) {
			await this.discoverFiles(fitbitApi);
		}

		for (const file of this.files) {
			if (file.status === 'pending' || file.status === 'failed') {
				try {
					const logId = file.name.match(/(\d+)\.tcx$/)?.[1];
					if (!logId) throw new Error('Could not parse logId from filename');

					const url = `/1/user/-/activities/${logId}.tcx`;
					const res = await fitbitApi.apiCall(url);
					if (!res.ok) throw new Error(`Failed to fetch TCX for logId ${logId}`);

					const tcxData = await res.text();
					if (tcxData) {
						file.blob = new Blob([tcxData], { type: 'application/vnd.garmin.tcx+xml' });
					}
					file.status = 'completed';
				} catch (error) {
					console.error(error);
					file.status = 'failed';
				}
			}
		}
	}

	private async discoverFiles(fitbitApi: FitbitAPI): Promise<void> {
		const allActivities = [];
		let nextUrl: string | undefined = `/1/user/-/activities/list.json?afterDate=${
			new Date(this.year, this.month - 1, 1).toISOString().split('T')[0]
		}&offset=0&limit=100&sort=asc`;

		while (nextUrl) {
			const res = await fitbitApi.apiCall(nextUrl);
			if (!res.ok) throw new Error('Failed to discover TCX files');

			const data = (await res.json()) as FitbitPaginatedActivityResponse;
			allActivities.push(...data.activities);
			nextUrl = data.pagination.next
				? new URL(data.pagination.next).pathname + new URL(data.pagination.next).search
				: undefined;
		}

		const activitiesInMonth = allActivities.filter(
			(a) => new Date(a.startTime).getMonth() === this.month - 1 && a.logId
		);

		this.files = activitiesInMonth.map((a) => ({
			name: `tcx-${this.year}-${String(this.month).padStart(2, '0')}-${a.logId}.tcx`,
			blob: null,
			status: 'pending'
		}));
	}
}
