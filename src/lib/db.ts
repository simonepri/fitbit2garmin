import Dexie, { type Table } from 'dexie';
import type { StoredFile, DownloadTask } from './types';

export class FitbitDB extends Dexie {
	// 'files' is added by Dexie when declaring the stores()
	// We just tell the typing system this is the case
	files!: Table<StoredFile>;
    tasks!: Table<DownloadTask>;

	constructor() {
		super('fitbit2garmin');
		this.version(1).stores({
			// Primary key is 'id', 'taskId' is an index
			files: 'id, taskId',
            tasks: 'id, type, status'
		});
	}

    // --- File methods ---
    async addFile(file: StoredFile) {
        return this.files.put(file);
    }

    async getFilesForTask(taskId: string): Promise<StoredFile[]> {
        return this.files.where('taskId').equals(taskId).toArray();
    }

    async deleteFilesForTask(taskId: string) {
        const fileIdsToDelete = await this.files.where('taskId').equals(taskId).primaryKeys();
        return this.files.bulkDelete(fileIdsToDelete);
    }

    async countFilesForTask(taskId: string): Promise<number> {
        return this.files.where('taskId').equals(taskId).count();
    }

    // --- Task methods ---
    async loadTasks(): Promise<DownloadTask[]> {
        return this.tasks.toArray();
    }

    async saveTasks(tasks: DownloadTask[]) {
        // Using bulkPut to add/update all tasks efficiently
        return this.tasks.bulkPut(tasks);
    }

    async clearAllData() {
        await this.files.clear();
        await this.tasks.clear();
    }
}

export const db = new FitbitDB();
