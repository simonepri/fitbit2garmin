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
        getFilesForTask: vi.fn().mockResolvedValue([]),
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

function createMockFetch(response: any, ok = true) {
    return vi.fn().mockResolvedValue({
        ok,
        json: () => Promise.resolve(response),
        headers: new Headers({
            'fitbit-rate-limit-limit': '150',
			'fitbit-rate-limit-remaining': '149',
			'fitbit-rate-limit-reset': '3600'
        })
    });
}

vi.stubGlobal('fetch', createMockFetch({ activities: [] }));


describe('Downloads Store', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(db.loadTasks).mockClear();
        // Reset the store to its initial state by setting it to an empty array
        const { set } = downloads;
        set([]);
    });

    it('should add new tasks and ignore duplicates', async () => {
        vi.stubGlobal('fetch', createMockFetch({ activities: [] }));

        return new Promise(async (resolve) => {
            const unsubscribe = downloads.subscribe(tasks => {
                if (tasks.length === 4) {
                    expect(tasks.find(t => t.id === 'weight-2023-1')).toBeDefined();

                    // Try to add again, expect no change
                    const addedCount2 = downloads.addTasks(new Date('2023-01-01'), new Date('2023-01-15'), ['weight']);
                    expect(addedCount2).toBe(0);
                    expect(get(downloads).length).toBe(4);

                    unsubscribe();
                    resolve();
                }
            });

            const addedCount = downloads.addTasks(new Date('2023-01-01'), new Date('2023-02-15'), ['weight', 'tcx']);
            expect(addedCount).toBe(4);
        });
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
        const failedTask = {
            id: 'weight-2023-1',
            type: 'weight',
            year: 2023,
            month: 1,
            status: 'failed',
            totalFiles: 0,
            completedFiles: 0,
            failedFiles: 0,
            retries: 1
        };
        downloads.set([failedTask]);

        await downloads.retryTask('weight-2023-1');

        const tasks = get(downloads);
        const retriedTask = tasks.find(t => t.id === 'weight-2023-1');

        expect(retriedTask?.status).toBe('downloading');
        expect(retriedTask?.retries).toBe(2);
        expect(db.deleteFilesForTask).toHaveBeenCalledWith('weight-2023-1');
    });
});
