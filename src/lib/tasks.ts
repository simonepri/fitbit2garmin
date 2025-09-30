import type { FitbitAPI } from './fitbit-api';

export const TASK_TYPES = ['weight', 'activity', 'tcx'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface TaskProgress {
	total: number;
	completed: number;
	failed: number;
	empty: number;
}

export interface TaskResult {
	name: string;
	data: Blob | string;
}

function getMonthDateRange(yearMonth: string): { startDate: string; endDate: string } {
	const [year, month] = yearMonth.split('-').map(Number);
	// Use UTC to avoid timezone issues
	const startDate = new Date(Date.UTC(year, month - 1, 1));
	const endDate = new Date(Date.UTC(year, month, 0)); // Day 0 of next month is last day of current month
	return {
		startDate: startDate.toISOString().split('T')[0],
		endDate: endDate.toISOString().split('T')[0]
	};
}

// Base class for all download tasks
export abstract class DownloadTask {
	id: string;
	type: TaskType;
	date: string; // YYYY-MM
	status: TaskStatus = 'pending';
	progress: TaskProgress = { total: 0, completed: 0, failed: 0, empty: 0 };
	runtime: number = 0; // in milliseconds
	result: TaskResult[] = [];
	error: string | null = null;

	private _startTime: number | null = null;

	constructor(type: TaskType, date: string) {
		this.id = `${type}-${date}`;
		this.type = type;
		this.date = date;
	}

	abstract run(api: FitbitAPI): Promise<void>;

	startTimer() {
		this._startTime = performance.now();
	}

	stopTimer() {
		if (this._startTime) {
			this.runtime += performance.now() - this._startTime;
			this._startTime = null;
		}
	}

	toJSON() {
		return {
			id: this.id,
			type: this.type,
			date: this.date,
			status: this.status,
			progress: this.progress,
			runtime: this.runtime,
			result: this.result,
			error: this.error
		};
	}

	static fromJSON(obj: any): DownloadTask {
		let task: DownloadTask;
		switch (obj.type as TaskType) {
			case 'weight':
				task = new WeightDownloadTask(obj.date);
				break;
			case 'activity':
				task = new ActivityDownloadTask(obj.date);
				break;
			case 'tcx':
				task = new TcxDownloadTask(obj.date);
				break;
			default:
				throw new Error(`Unknown task type: ${obj.type}`);
		}
		Object.assign(task, { ...obj, result: [] }); // Don't deserialize file data
		return task;
	}
}

// Concrete task implementations will go here
export class WeightDownloadTask extends DownloadTask {
	constructor(date: string) {
		super('weight', date);
		this.progress.total = 1;
	}

	async run(api: FitbitAPI): Promise<void> {
		const { startDate, endDate } = getMonthDateRange(this.date);
		const url = `/1/user/-/body/log/weight/date/${startDate}/${endDate}.json`;
		const response = await api.get(url);

		if (!response.ok) {
			throw new Error(`Fitbit API error: ${response.status} ${await response.text()}`);
		}

		const data = await response.json();
		const weights: any[] = data.weight || [];

		if (weights.length === 0) {
			this.progress.empty = 1;
			return;
		}

		let csv = 'Date,Weight,BMI,Fat\n';
		for (const entry of weights) {
			csv += `${entry.date},${entry.weight},${entry.bmi},${entry.fat || '0'}\n`;
		}

		this.result = [
			{
				name: `weight-${this.date}.csv`,
				data: `Body\n${csv}`
			}
		];
		this.progress.completed = 1;
	}
}

export class ActivityDownloadTask extends DownloadTask {
	constructor(date: string) {
		super('activity', date);
		this.progress.total = 1;
	}

	async run(api: FitbitAPI): Promise<void> {
		const { startDate, endDate } = getMonthDateRange(this.date);
		const resources = [
			'activityCalories',
			'calories',
			'distance',
			'floors',
			'minutesSedentary',
			'minutesLightlyActive',
			'minutesFairlyActive',
			'minutesVeryActive',
			'steps'
		];

		const activityByDate: Record<string, Record<string, any>> = {};

		for (const resource of resources) {
			const url = `/1/user/-/activities/${resource}/date/${startDate}/${endDate}.json`;
			const response = await api.get(url);
			if (!response.ok) {
				throw new Error(
					`Fitbit API error for resource ${resource}: ${response.status} ${await response.text()}`
				);
			}
			const data = await response.json();
			const activities = data[`activities-${resource}`] || [];
			for (const activity of activities) {
				if (!activityByDate[activity.dateTime]) {
					activityByDate[activity.dateTime] = {};
				}
				activityByDate[activity.dateTime][resource] = activity.value;
			}
		}

		const entries = Object.entries(activityByDate)
			.map(([date, values]) => ({ date, ...values }))
			.filter((entry) => parseInt(entry.steps || '0', 10) > 0);

		if (entries.length === 0) {
			this.progress.empty = 1;
			return;
		}

		const header =
			'Date,Calories Burned,Steps,Distance,Floors,Minutes Sedentary,Minutes Lightly Active,Minutes Fairly Active,Minutes Very Active,Activity Calories\n';
		let csv = '';
		// Sort entries by date just in case
		entries.sort((a, b) => a.date.localeCompare(b.date));
		for (const entry of entries) {
			csv += `${entry.date},${entry.calories || 0},${entry.steps || 0},${entry.distance || 0},${
				entry.floors || 0
			},${entry.minutesSedentary || 0},${entry.minutesLightlyActive || 0},${
				entry.minutesFairlyActive || 0
			},${entry.minutesVeryActive || 0},${entry.activityCalories || 0}\n`;
		}

		this.result = [
			{
				name: `activity-${this.date}.csv`,
				data: `Activities\n${header}${csv}`
			}
		];
		this.progress.completed = 1;
	}
}

export class TcxDownloadTask extends DownloadTask {
	constructor(date: string) {
		super('tcx', date);
	}

	async run(api: FitbitAPI): Promise<void> {
		const { startDate, endDate } = getMonthDateRange(this.date);
		const endDateTime = new Date(`${endDate}T23:59:59.999Z`);

		let activities: any[] = [];
		let nextUrl: string | null = `/1/user/-/activities/list.json?afterDate=${startDate}&sort=asc&offset=0&limit=100`;

		while (nextUrl) {
			const response = await api.get(nextUrl);
			if (!response.ok) {
				throw new Error(
					`Fitbit API error fetching activity list: ${response.status} ${await response.text()}`
				);
			}
			const data = await response.json();
			if (!data.activities || data.activities.length === 0) {
				break;
			}

			const newActivitiesInMonth = data.activities.filter((a: any) => {
				const activityDate = new Date(a.originalStartTime);
				return activityDate <= endDateTime;
			});

			activities.push(...newActivitiesInMonth);

			if (newActivitiesInMonth.length < data.activities.length) {
				break; // We've passed the end of the month, so stop paginating
			}

			nextUrl = data.pagination?.next || null;
		}

		const tcxActivities = activities.filter((a) => a.logType !== 'auto_detected' && a.logId);
		this.progress.total = tcxActivities.length;

		if (this.progress.total === 0) {
			return; // No TCX files to download
		}

		for (const activity of tcxActivities) {
			const logId = activity.logId;
			try {
				const url = `/1/user/-/activities/${logId}.tcx`;
				const response = await api.get(url);
				if (!response.ok) {
					throw new Error(`Failed to fetch TCX for logId ${logId}: ${response.status}`);
				}

				const tcxBlob = await response.blob();
				// Empty TCX from Fitbit is ~450 bytes. Using 500 as a safe threshold.
				if (tcxBlob.size <= 500) {
					this.progress.empty++;
					continue;
				}

				this.result.push({
					name: `tcx-${this.date}-${logId}.tcx`,
					data: tcxBlob
				});
				this.progress.completed++;
			} catch (e) {
				console.error(`Failed to download TCX for logId ${logId}`, e);
				this.progress.failed++;
			}
		}
	}
}