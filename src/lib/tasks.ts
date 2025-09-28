import type { FitbitApi } from './fitbit-api';

export type TaskType = 'weight' | 'activity' | 'tcx';
export type TaskStatus = 'pending' | 'downloading' | 'completed' | 'failed';

export interface TaskFile {
	id: string;
	status: 'pending' | 'completed' | 'failed' | 'empty';
	content?: Blob;
}

interface FitbitWeightEntry {
	date: string;
	weight: number;
	bmi: number;
	fat?: number;
}

interface FitbitActivityLogEntry {
	logId: string;
	logType: string;
	startTime: string;
}

interface FitbitActivityTimeseriesEntry {
	dateTime: string;
	value: string;
}

interface FitbitDailyActivity {
	date: string;
	calories: string;
	steps: string;
	distance?: string;
	floors?: string;
	minutesSedentary: string;
	minutesLightlyActive: string;
	minutesFairlyActive: string;
	minutesVeryActive: string;
	activityCalories: string;
}

export abstract class Task {
	public id: string;
	public type: TaskType;
	public date: { year: number; month: number };
	public status: TaskStatus = 'pending';
	public runtime: number = 0;
	public files: TaskFile[] = [];

	private timerStart: number = 0;

	constructor(type: TaskType, year: number, month: number) {
		this.type = type;
		this.date = { year, month };
		this.id = `${type}-${year}-${month}`;
	}

	public abstract run(api: FitbitApi): Promise<void>;

	public startTimer() {
		this.timerStart = performance.now();
	}

	public stopTimer() {
		if (this.timerStart > 0) {
			this.runtime += performance.now() - this.timerStart;
			this.timerStart = 0;
		}
	}

	public toJSON() {
		return {
			id: this.id,
			type: this.type,
			date: this.date,
			status: this.status,
			runtime: this.runtime,
			files: this.files.map((f) => ({ ...f, content: undefined })) // Don't serialize content
		};
	}

	protected formatDate(day: number): string {
		const d = new Date(this.date.year, this.date.month - 1, day);
		const year = d.getFullYear();
		const month = (d.getMonth() + 1).toString().padStart(2, '0');
		const d_day = d.getDate().toString().padStart(2, '0');
		return `${year}-${month}-${d_day}`;
	}
}

export class WeightTask extends Task {
	constructor(year: number, month: number) {
		super('weight', year, month);
		this.files = [{ id: `${this.id}.csv`, status: 'pending' }];
	}

	async run(api: FitbitApi): Promise<void> {
		this.status = 'downloading';
		const startDate = this.formatDate(1);
		const endDate = this.formatDate(new Date(this.date.year, this.date.month, 0).getDate());

		try {
			const response = await api.apiFetch(
				`1/user/-/body/log/weight/date/${startDate}/${endDate}.json`
			);
			if (!response.ok) throw new Error('Failed to fetch weight data');

			const data: { weight: FitbitWeightEntry[] } = await response.json();
			const weights = data.weight;

			if (weights.length === 0) {
				this.files[0].status = 'empty';
			} else {
				let csvContent = 'Body\nDate,Weight,BMI,Fat\n';
				weights.forEach((entry) => {
					csvContent += `${entry.date},${entry.weight},${entry.bmi},${entry.fat || '0'}\n`;
				});
				this.files[0].content = new Blob([csvContent], { type: 'text/csv' });
				this.files[0].status = 'completed';
			}
			this.status = 'completed';
		} catch (error) {
			this.files[0].status = 'failed';
			this.status = 'failed';
			console.error('Weight task failed:', error);
		}
	}
}

export class ActivityTask extends Task {
	constructor(year: number, month: number) {
		super('activity', year, month);
		this.files = [{ id: `${this.id}.csv`, status: 'pending' }];
	}

	async run(api: FitbitApi): Promise<void> {
		this.status = 'downloading';
		const startDate = this.formatDate(1);
		const endDate = this.formatDate(new Date(this.date.year, this.date.month, 0).getDate());

		try {
			const resources = [
				'calories',
				'steps',
				'distance',
				'floors',
				'minutesSedentary',
				'minutesLightlyActive',
				'minutesFairlyActive',
				'minutesVeryActive',
				'activityCalories'
			];
			const data: Record<string, Partial<FitbitDailyActivity>> = {};

			for (const resource of resources) {
				const response = await api.apiFetch(
					`1/user/-/activities/${resource}/date/${startDate}/${endDate}.json`
				);
				if (!response.ok) throw new Error(`Failed to fetch ${resource}`);
				const res_data: { [key: string]: FitbitActivityTimeseriesEntry[] } = await response.json();
				res_data[`activities-${resource}`].forEach((entry) => {
					if (!data[entry.dateTime]) data[entry.dateTime] = { date: entry.dateTime };
					(data[entry.dateTime] as Record<string, string>)[resource] = entry.value;
				});
			}

			const activities = Object.values(data).filter(
				(d) => d.steps && parseInt(d.steps, 10) > 0
			) as FitbitDailyActivity[];

			if (activities.length === 0) {
				this.files[0].status = 'empty';
			} else {
				let csvContent =
					'Activities\nDate,Calories Burned,Steps,Distance,Floors,Minutes Sedentary,Minutes Lightly Active,Minutes Fairly Active,Minutes Very Active,Activity Calories\n';
				activities.forEach((entry) => {
					csvContent += `${entry.date},${entry.calories},${entry.steps},${entry.distance || 0},${
						entry.floors || 0
					},${entry.minutesSedentary},${entry.minutesLightlyActive},${
						entry.minutesFairlyActive
					},${entry.minutesVeryActive},${entry.activityCalories}\n`;
				});
				this.files[0].content = new Blob([csvContent], { type: 'text/csv' });
				this.files[0].status = 'completed';
			}
			this.status = 'completed';
		} catch (error) {
			this.files[0].status = 'failed';
			this.status = 'failed';
			console.error('Activity task failed:', error);
		}
	}
}

export class TcxTask extends Task {
	constructor(year: number, month: number) {
		super('tcx', year, month);
		// Files are populated dynamically in run
	}

	async run(api: FitbitApi): Promise<void> {
		this.status = 'downloading';

		try {
			if (this.files.length === 0) {
				await this.populateFiles(api);
			}

			for (const file of this.files) {
				if (file.status === 'pending' || file.status === 'failed') {
					try {
						const response = await api.apiFetch(`1/user/-/activities/${file.id}.tcx`);
						if (!response.ok) {
							const errorText = await response.text();
							console.error(
								`Fitbit API Error for TCX ${file.id}:`,
								response.status,
								response.statusText,
								errorText
							);
							throw new Error(`Failed to fetch TCX for logId ${file.id}`);
						}
						const tcxContent = await response.text();
						if (tcxContent.trim().split('\n').length <= 15) {
							file.status = 'empty';
						} else {
							file.content = new Blob([tcxContent], {
								type: 'application/vnd.garmin.tcx+xml'
							});
							file.status = 'completed';
						}
					} catch (e) {
						file.status = 'failed';
						console.error(`Failed to download TCX ${file.id}:`, e);
					}
				}
			}

			const completed = this.files.every((f) => f.status === 'completed' || f.status === 'empty');
			const failed = this.files.some((f) => f.status === 'failed');

			if (failed) this.status = 'failed';
			else if (completed) this.status = 'completed';
		} catch (error) {
			this.status = 'failed';
			console.error('TCX task failed:', error);
		}
	}

	private async populateFiles(api: FitbitApi): Promise<void> {
		const afterDate = this.formatDate(1);
		const response = await api.apiFetch(
			`1/user/-/activities/list.json?afterDate=${afterDate}&sort=asc&limit=100&offset=0`
		);
		if (!response.ok) throw new Error('Failed to fetch activity list');

		// Patch the response to handle large logId numbers
		const text = await response.text();
		const patchedText = text.replace(/"logId":(\d+)/g, '"logId":"$1"');
		const data: { activities: FitbitActivityLogEntry[] } = JSON.parse(patchedText);
		this.files = data.activities
			.filter((activity) => {
				const activityDate = new Date(activity.startTime);
				return (
					activityDate.getFullYear() === this.date.year &&
					activityDate.getMonth() === this.date.month - 1
				);
			})
			.filter((activity) => activity.logType !== 'auto_detected' && activity.logId)
			.map((activity) => ({
				id: activity.logId.toString(),
				status: 'pending'
			}));
	}
}
