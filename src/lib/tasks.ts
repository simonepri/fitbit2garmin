import { apiFetch } from './fitbit-api';
import { format } from 'date-fns';

export type TaskType = 'weight' | 'activity' | 'tcx';
export type TaskStatus = 'pending' | 'downloading' | 'completed' | 'failed';

export type TaskFile = {
	name: string;
	content: string | ArrayBuffer;
};

export type TaskProgress = {
	total: number;
	completed: number;
	failed: number;
	empty: number;
};

type WeightEntry = {
	date: string;
	weight: number;
	bmi: number;
	fat?: number;
};

type ActivityLog = {
	logId: number;
	startTime: string;
};

type AggregatedActivity = {
	date: string;
	calories?: string;
	steps?: string;
	distance?: string;
	floors?: string;
	minutesSedentary?: string;
	minutesLightlyActive?: string;
	minutesFairlyActive?: string;
	minutesVeryActive?: string;
	activityCalories?: string;
};

// Base class for all tasks
export abstract class Task {
	id: string;
	type: TaskType;
	year: number;
	month: number;
	status: TaskStatus = 'pending';
	progress: TaskProgress = { total: 0, completed: 0, failed: 0, empty: 0 };
	runtime: number = 0;
	lastError: string | null = null;
	files: TaskFile[] = [];

	private _startTime: number = 0;

	constructor(type: TaskType, year: number, month: number) {
		this.id = `${type}-${year}-${month}`;
		this.type = type;
		this.year = year;
		this.month = month;
	}

	abstract run(): Promise<void>;

	startTimer() {
		if (this._startTime === 0) {
			this._startTime = performance.now();
		}
	}

	stopTimer() {
		if (this._startTime !== 0) {
			this.runtime += performance.now() - this._startTime;
			this._startTime = 0;
		}
	}

	toJSON(): Record<string, unknown> {
		return {
			id: this.id,
			type: this.type,
			year: this.year,
			month: this.month,
			status: this.status,
			progress: this.progress,
			runtime: this.runtime,
			lastError: this.lastError,
			files: this.files
		};
	}

	static fromJSON(data: Record<string, unknown>): Task {
		let task: Task;
		switch (data.type) {
			case 'weight':
				task = new WeightTask(data.year as number, data.month as number);
				break;
			case 'activity':
				task = new ActivityTask(data.year as number, data.month as number);
				break;
			case 'tcx':
				task = new TcxTask(data.year as number, data.month as number);
				break;
			default:
				throw new Error(`Unknown task type: ${data.type}`);
		}
		Object.assign(task, data);
		return task;
	}
}

export class WeightTask extends Task {
	constructor(year: number, month: number) {
		super('weight', year, month);
		this.progress.total = 1;
	}

	async run(): Promise<void> {
		this.status = 'downloading';
		this.startTimer();

		try {
			const startDate = format(new Date(this.year, this.month - 1, 1), 'yyyy-MM-dd');
			const endDate = format(new Date(this.year, this.month, 0), 'yyyy-MM-dd');
			const response = await apiFetch(
				`1/user/-/body/log/weight/date/${startDate}/${endDate}.json`
			);
			const data: { weight: WeightEntry[] } = await response.json();
			const weights = data.weight;

			if (weights.length === 0) {
				this.progress.empty = 1;
			} else {
				let csv = 'Body\nDate,Weight,BMI,Fat\n';
				weights.forEach((w) => {
					csv += `${w.date},${w.weight},${w.bmi},${w.fat || '0'}\n`;
				});
				this.files.push({
					name: `weight-${this.year}-${this.month}.csv`,
					content: csv
				});
				this.progress.completed = 1;
			}

			this.status = 'completed';
		} catch (e) {
			this.status = 'failed';
			this.lastError = e instanceof Error ? e.message : String(e);
			this.progress.failed = 1;
		} finally {
			this.stopTimer();
		}
	}
}

export class ActivityTask extends Task {
	constructor(year: number, month: number) {
		super('activity', year, month);
		this.progress.total = 1;
	}

	async run(): Promise<void> {
		this.status = 'downloading';
		this.startTimer();

		try {
			const startDate = format(new Date(this.year, this.month - 1, 1), 'yyyy-MM-dd');
			const endDate = format(new Date(this.year, this.month, 0), 'yyyy-MM-dd');
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

			const promises = resources.map((res) =>
				apiFetch(
					`1/user/-/activities/${res}/date/${startDate}/${endDate}.json`
				).then((r) => r.json())
			);

			const results = await Promise.all(promises);
			const activitiesByDate: { [key: string]: AggregatedActivity } = {};

			results.forEach((data, index) => {
				const resource = resources[index];
				data[`activities-${resource}`].forEach((entry: { dateTime: string; value: string }) => {
					if (!activitiesByDate[entry.dateTime]) {
						activitiesByDate[entry.dateTime] = { date: entry.dateTime };
					}
					activitiesByDate[entry.dateTime][resource] = entry.value;
				});
			});

			const activities = Object.values(activitiesByDate).filter(
				(a) => a.steps && parseInt(a.steps) > 0
			);

			if (activities.length === 0) {
				this.progress.empty = 1;
			} else {
				let csv =
					'Activities\nDate,Calories Burned,Steps,Distance,Floors,Minutes Sedentary,Minutes Lightly Active,Minutes Fairly Active,Minutes Very Active,Activity Calories\n';
				activities.forEach((a) => {
					csv += `${a.date},${a.calories || 0},${a.steps || 0},${a.distance || 0},${
						a.floors || 0
					},${a.minutesSedentary || 0},${a.minutesLightlyActive || 0},${
						a.minutesFairlyActive || 0
					},${a.minutesVeryActive || 0},${a.activityCalories || 0}\n`;
				});
				this.files.push({
					name: `activity-${this.year}-${this.month}.csv`,
					content: csv
				});
				this.progress.completed = 1;
			}
			this.status = 'completed';
		} catch (e) {
			this.status = 'failed';
			this.lastError = e instanceof Error ? e.message : String(e);
			this.progress.failed = 1;
		} finally {
			this.stopTimer();
		}
	}
}

export class TcxTask extends Task {
	private activityLogs: ActivityLog[] = [];

	constructor(year: number, month: number) {
		super('tcx', year, month);
	}

	async run(): Promise<void> {
		this.status = 'downloading';
		this.lastError = null;
		this.startTimer();
		try {
			if (this.activityLogs.length === 0) {
				await this.fetchActivityLogList();
			}

			if (this.activityLogs.length === 0) {
				this.status = 'completed';
				this.stopTimer();
				return;
			}

			const tcxDownloads = this.activityLogs.map((log) => this.downloadTcx(log.logId));
			await Promise.all(tcxDownloads);

			if (this.progress.failed > 0) {
				this.status = 'failed';
			} else {
				this.status = 'completed';
			}
		} catch (e) {
			this.status = 'failed';
			this.lastError = e instanceof Error ? e.message : String(e);
		} finally {
			this.stopTimer();
		}
	}

	private async fetchActivityLogList(): Promise<void> {
		const afterDate = format(new Date(this.year, this.month - 1, 1), 'yyyy-MM-dd');
		let url: string | null = `1/user/-/activities/list.json?afterDate=${afterDate}&sort=asc&limit=100&offset=0`;
		const endDate = new Date(this.year, this.month, 1);

		this.activityLogs = [];

		while (url) {
			const response = await apiFetch(url);
			const data: { activities: ActivityLog[]; pagination: { next?: string } } =
				await response.json();
			const monthlyActivities = data.activities.filter(
				(a: ActivityLog) => new Date(a.startTime) < endDate
			);
			this.activityLogs.push(...monthlyActivities);

			url = data.pagination.next || null;
			if (monthlyActivities.length === 0 && data.activities.length > 0) {
				// We are past the month we care about
				url = null;
			}
		}

		this.progress.total = this.activityLogs.length;
	}

	private async downloadTcx(logId: number): Promise<void> {
		const fileName = `tcx-${this.year}-${this.month}-${logId}.tcx`;
		try {
			// Skip retrying already completed files
			if (this.files.some((f) => f.name === fileName)) {
				return;
			}

			const response = await apiFetch(`1/user/-/activities/${logId}.tcx`);
			const tcx = await response.text();

			if (tcx.trim().split('\n').length <= 15) {
				this.progress.empty++;
			} else {
				this.files.push({
					name: fileName,
					content: tcx
				});
				this.progress.completed++;
			}
		} catch (e) {
			this.progress.failed++;
			const message = e instanceof Error ? e.message : String(e);
			this.lastError = (this.lastError || '') + `Failed to download log ${logId}: ${message}\n`;
		}
	}

	toJSON(): Record<string, unknown> {
		return {
			...super.toJSON(),
			activityLogs: this.activityLogs
		};
	}
}