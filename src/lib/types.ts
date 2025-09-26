export type TaskStatus = 'pending' | 'running' | 'failed' | 'completed';
export type DataType = 'weight' | 'activity' | 'tcx';

export interface TaskFile {
	name: string;
	blob: Blob | null;
	status: 'pending' | 'completed' | 'failed';
}

// Fitbit API response types
export interface FitbitWeightLog {
	date: string;
	weight: number;
}

export interface FitbitActivityLog {
	startTime: string;
	activityName: string;
	calories: number;
	steps?: number;
	distance?: number;
	logId?: number;
}

export interface FitbitWeightResponse {
	weight: FitbitWeightLog[];
}

export interface FitbitActivityResponse {
	activities: FitbitActivityLog[];
}

export interface FitbitPagination {
	afterDate?: string;
	limit?: number;
	next?: string;
	offset?: number;
	previous?: string;
	sort?: string;
}

export interface FitbitPaginatedActivityResponse extends FitbitActivityResponse {
	pagination: FitbitPagination;
}

// For serialization
export interface SerializedTask {
	id: string;
	type: DataType;
	status: TaskStatus;
	year: number;
	month: number;
	runtime: number;
	files: Omit<TaskFile, 'blob'>[];
	createdAt: number;
	updatedAt: number;
}

export interface FitbitState {
	accessToken: string | null;
	refreshToken: string | null;
	userId: string | null;
	scope: string | null;
	tokenType: string | null;
	expiresAt: number;
	rateLimitLimit: number;
	rateLimitRemaining: number;
	rateLimitReset: number;
}
