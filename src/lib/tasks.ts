import type { FitbitActivityLog, FitbitWeightLog, FitbitTimeSeriesData } from './fitbit-api';
import { FitbitAPI } from './fitbit-api';

// --- Enums and Types ---

export enum TaskStatus {
	Pending = 'pending',
	Downloading = 'downloading',
	Completed = 'completed',
	Failed = 'failed'
}

export enum DataType {
	Weight = 'weight',
	Activity = 'activity',
	TCX = 'tcx'
}

export interface TaskFile {
	id: string;
	status: 'pending' | 'completed' | 'failed' | 'empty';
	content?: string | Blob;
}

export interface TaskState {
	id: string;
	type: DataType;
	year: number;
	month: number;
	status: TaskStatus;
	runtime: number; // in milliseconds
	files: TaskFile[];
	error?: string;
}

interface ActivityData {
	date: string;
	activityCalories?: string;
	calories?: string;
	distance?: string;
	floors?: string;
	minutesSedentary?: string;
	minutesLightlyActive?: string;
	minutesFairlyActive?: string;
	minutesVeryActive?: string;
	steps?: string;
}

// --- Base Task Class ---

export abstract class Task {
	public state: TaskState;
	private timerStart: number | null = null;

	constructor(state: TaskState) {
		this.state = state;
	}

	static fromJSON(state: TaskState): Task {
		switch (state.type) {
			case DataType.Weight:
				return new WeightTask(state);
			case DataType.Activity:
				return new ActivityTask(state);
			case DataType.TCX:
				return new TcxTask(state);
			default:
				throw new Error(`Unknown task type: ${state.type}`);
		}
	}

	public toJSON(): TaskState {
		return this.state;
	}

	public get id(): string {
		return this.state.id;
	}

	public get status(): TaskStatus {
		return this.state.status;
	}

	public startTimer(): void {
		if (this.timerStart === null) {
			this.timerStart = performance.now();
		}
	}

	public stopTimer(): void {
		if (this.timerStart !== null) {
			this.state.runtime += performance.now() - this.timerStart;
			this.timerStart = null;
		}
	}

	public abstract run(fitbitApi: FitbitAPI): Promise<void>;

	protected async executeRun(logic: () => Promise<boolean>): Promise<void> {
		this.state.status = TaskStatus.Downloading;
		this.startTimer();
		try {
			const success = await logic();
			if (success) {
				this.state.status = TaskStatus.Completed;
			}
		} catch (error) {
			this.state.status = TaskStatus.Failed;
			this.state.error = error instanceof Error ? error.message : String(error);
			console.error(`Task ${this.id} failed:`, error);
		} finally {
			this.stopTimer();
		}
	}

	public retry(): void {
		this.state.status = TaskStatus.Pending;
		this.state.error = undefined;
		// Only reset failed or pending files to pending, keep completed ones.
		this.state.files.forEach((file) => {
			if (file.status === 'failed' || file.status === 'pending') {
				file.status = 'pending';
			}
		});
	}

	public getProgress() {
		const total = this.state.files.length;
		const completed = this.state.files.filter((f) => f.status === 'completed').length;
		const failed = this.state.files.filter((f) => f.status === 'failed').length;
		const empty = this.state.files.filter((f) => f.status === 'empty').length;
		return { total, completed, failed, empty };
	}
}

// --- Specialized Task Classes ---

export class WeightTask extends Task {
	constructor(state: TaskState) {
		super(state);
		if (state.files.length === 0) {
			this.state.files = [{ id: `${state.year}-${state.month}`, status: 'pending' }];
		}
	}

	async run(fitbitApi: FitbitAPI): Promise<void> {
		await this.executeRun(async () => {
			const startDate = `${this.state.year}-${String(this.state.month).padStart(2, '0')}-01`;
			const endDate = new Date(this.state.year, this.state.month, 0);
			const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(
				2,
				'0'
			)}-${String(endDate.getDate()).padStart(2, '0')}`;

			const file = this.state.files[0];
			if (file.status === 'completed') return true;

			try {
				const response = await fitbitApi.getWeightLogs(startDate, endDateStr);
				const weightData = response['weight'];

				if (!weightData || weightData.length === 0) {
					file.status = 'empty';
					return true;
				}

				let csvContent = 'Body\nDate,Weight,BMI,Fat\n';
				weightData.forEach((entry: FitbitWeightLog) => {
					csvContent += `${entry.date},${entry.weight},${entry.bmi},${entry.fat || 0}\n`;
				});

				file.content = csvContent;
				file.status = 'completed';
			} catch (error) {
				file.status = 'failed';
				throw error;
			}
			return this.state.files.every((f) => f.status === 'completed' || f.status === 'empty');
		});
	}
}

export class ActivityTask extends Task {
	constructor(state: TaskState) {
		super(state);
		if (state.files.length === 0) {
			this.state.files = [{ id: `${state.year}-${state.month}`, status: 'pending' }];
		}
	}
	async run(fitbitApi: FitbitAPI): Promise<void> {
		await this.executeRun(async () => {
			const startDate = `${this.state.year}-${String(this.state.month).padStart(2, '0')}-01`;
			const endDate = new Date(this.state.year, this.state.month, 0);
			const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(
				2,
				'0'
			)}-${String(endDate.getDate()).padStart(2, '0')}`;
			const file = this.state.files[0];
			if (file.status === 'completed') return true;
			try {
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
					fitbitApi.getActivityTimeSeries(res, startDate, endDateStr)
				);
				const results = await Promise.all(promises);
				const activityByDate: { [key: string]: ActivityData } = {};
				results.forEach((result, i) => {
					const resource = resources[i];
					result[`activities-${resource}`].forEach((entry: FitbitTimeSeriesData) => {
						if (!activityByDate[entry.dateTime]) {
							activityByDate[entry.dateTime] = { date: entry.dateTime };
						}
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						(activityByDate[entry.dateTime] as any)[resource] = entry.value;
					});
				});

				const entries = Object.values(activityByDate).filter(
					(e) => e.steps && parseInt(e.steps, 10) > 0
				);

				if (entries.length === 0) {
					file.status = 'empty';
					return true;
				}
				let csvContent =
					'Activities\nDate,Calories Burned,Steps,Distance,Floors,Minutes Sedentary,Minutes Lightly Active,Minutes Fairly Active,Minutes Very Active,Activity Calories\n';
				entries.forEach((entry) => {
					csvContent += `${entry.date},${entry.calories || 0},${entry.steps || 0},${
						entry.distance || 0
					},${entry.floors || 0},${entry.minutesSedentary || 0},${
						entry.minutesLightlyActive || 0
					},${entry.minutesFairlyActive || 0},${entry.minutesVeryActive || 0},${
						entry.activityCalories || 0
					}\n`;
				});
				file.content = csvContent;
				file.status = 'completed';
			} catch (error) {
				file.status = 'failed';
				throw error;
			}
			return this.state.files.every((f) => f.status === 'completed' || f.status === 'empty');
		});
	}
}

export class TcxTask extends Task {
	async run(fitbitApi: FitbitAPI): Promise<void> {
		await this.executeRun(async () => {
			if (this.state.files.length === 0) {
				await this.fetchActivityList(fitbitApi);
			}

			const filesToDownload = this.state.files.filter((f) => f.status === 'pending');
			const promises = filesToDownload.map((file) => this.downloadTcxFile(fitbitApi, file));
			await Promise.all(promises);

			return this.state.files.every((f) => f.status === 'completed' || f.status === 'empty');
		});
	}

	private async fetchActivityList(fitbitApi: FitbitAPI): Promise<void> {
		const startDate = `${this.state.year}-${String(this.state.month).padStart(2, '0')}-01`;
		const response = await fitbitApi.getActivityLogs(startDate);

		const activities = response.activities.filter((act: FitbitActivityLog) => {
			const actDate = new Date(act.originalStartTime);
			return (
				actDate.getFullYear() === this.state.year && actDate.getMonth() + 1 === this.state.month
			);
		});

		this.state.files = activities.map((act: FitbitActivityLog) => ({
			id: String(act.logId),
			status: act.logType === 'auto_detected' ? 'empty' : 'pending'
		}));
	}

	private async downloadTcxFile(fitbitApi: FitbitAPI, file: TaskFile): Promise<void> {
		try {
			const tcxContent = await fitbitApi.getActivityTCX(parseInt(file.id, 10));
			// TCX files with less than 15 lines are considered empty
			if (tcxContent.split('\n').length <= 15) {
				file.status = 'empty';
			} else {
				file.content = tcxContent;
				file.status = 'completed';
			}
		} catch (error) {
			file.status = 'failed';
			console.error(`Failed to download TCX file ${file.id}:`, error);
			// We don't rethrow here to allow other files to be downloaded.
		}
	}
}
