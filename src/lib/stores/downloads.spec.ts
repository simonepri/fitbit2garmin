import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { downloads } from './downloads';
import { db } from '$lib/db';
import { auth } from './auth';

// Mock dependencies
vi.mock('$lib/db', () => ({
	db: {
		loadTasks: vi.fn().mockResolvedValue([]),
		saveTasks: vi.fn().mockResolvedValue(undefined),
        deleteFilesForTask: vi.fn().mockResolvedValue(undefined),
        addFile: vi.fn().mockResolvedValue(undefined),
        files: {
            get: vi.fn().mockResolvedValue(null)
        }
	}
}));

vi.mock('./auth', async () => {
    const { readable } = await import('svelte/store');
    const mockToken = {
        access_token: 'mock-token',
        refresh_token: 'mock-refresh',
        expires_in: 3600,
        ts: Date.now() / 1000,
        scope: 'activity weight',
        token_type: 'Bearer',
        user_id: 'test'
    };
	return {
		auth: {
            ...readable(mockToken),
            updateToken: vi.fn()
        }
	};
});

vi.stubGlobal('fetch', vi.fn());

describe('Downloads Store', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(db.loadTasks).mockClear();
        // Reset the store to its initial state by setting it to an empty array
        const { set } = downloads;
        set([]);
    });

    it('should add new tasks and ignore duplicates', () => {
        const initialTasks = get(downloads);
        expect(initialTasks.length).toBe(0);

        const addedCount = downloads.addTasks(new Date('2023-01-01'), new Date('2023-02-15'), ['weight', 'tcx']);
        expect(addedCount).toBe(4); // 2 months * 2 types

        const tasks = get(downloads);
        expect(tasks.length).toBe(4);
        expect(tasks.find(t => t.id === 'weight-2023-1')).toBeDefined();

        // Try to add again
        const addedCount2 = downloads.addTasks(new Date('2023-01-01'), new Date('2023-01-15'), ['weight']);
        expect(addedCount2).toBe(0);
        expect(get(downloads).length).toBe(4);
    });

    it('should initialize from DB and sanitize downloading tasks', async () => {
        return new Promise(async (resolve) => {
            const mockTasks = [
                { id: 'weight-2023-1', status: 'completed' },
                { id: 'activity-2023-1', status: 'downloading' },
                { id: 'tcx-2023-1', status: 'pending' }
            ];
            vi.mocked(db.loadTasks).mockResolvedValue(mockTasks as any);

            const unsubscribe = downloads.subscribe(tasks => {
                // This will be called once on subscription with initial state,
                // and again when the state is set by initialize().
                if (tasks.length === 3) {
                    expect(tasks.find(t => t.id === 'activity-2023-1')?.status).toBe('pending');
                    expect(tasks.find(t => t.id === 'weight-2023-1')?.status).toBe('completed');
                    unsubscribe();
                    resolve();
                }
            });

            await downloads.initialize();
        });
    });

    it('should retry a failed task', async () => {
        downloads.addTasks(new Date('2023-01-01'), new Date('2023-01-15'), ['weight']);
        const task = get(downloads)[0];
        task.status = 'failed';
        task.retries = 1;

        await downloads.retryTask(task.id);

        const retriedTask = get(downloads).find(t => t.id === task.id);
        expect(retriedTask?.status).toBe('pending');
        expect(retriedTask?.retries).toBe(2);
        expect(db.deleteFilesForTask).toHaveBeenCalledWith(task.id);
    });
});
