export interface FitbitToken {
	access_token: string;
	expires_in: number;
	refresh_token: string;
	scope: string;
	token_type: 'Bearer';
	user_id: string;
	ts: number; // Timestamp in seconds when the token was received/refreshed
}

export type DataType = 'weight' | 'activity' | 'tcx';

export type TaskStatus = 'pending' | 'downloading' | 'completed' | 'failed';

export interface DownloadTask {
	id: string; // e.g., "weight-2023-01"
	type: DataType;
	year: number;
	month: number;
	status: TaskStatus;
	totalFiles: number;
	completedFiles: number;
	failedFiles: number;
    emptyFiles: number;
	retries: number;
}

export interface StoredFile {
    id: string; // e.g., "tcx-12345678" or "weight-2023-01"
    taskId: string;
    type: DataType;
    content: Blob | string;
    timestamp: number;
}
