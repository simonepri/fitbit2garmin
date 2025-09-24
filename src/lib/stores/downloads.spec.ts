import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { downloads } from './downloads';
import { db } from '$lib/db';
import * as api from '$lib/client/api';
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

        const addedCount = await downloads.addTasks(new Date('2023-01-01'), new Date('2023-02-15'), ['weight', 'tcx']);
        expect(addedCount).toBe(4);

        // Allow store to update
        await new Promise(r => setTimeout(r, 10));

        const tasks = get(downloads);
        expect(tasks.length).toBe(4);
        expect(tasks.find(t => t.id === 'weight-2023-1')).toBeDefined();

        // Try to add again
        const addedCount2 = await downloads.addTasks(new Date('2023-01-01'), new Date('2023-01-15'), ['weight']);
        expect(addedCount2).toBe(0);
        expect(get(downloads).length).toBe(4);
    });

    it('should initialize from DB and sanitize downloading tasks', async () => {
        const mockTasks = [
            { id: 'weight-2023-1', status: 'completed' },
            { id: 'activity-2023-1', status: 'downloading' },
            { id: 'tcx-2023-1', status: 'pending' }
        ];
        vi.mocked(db.loadTasks).mockResolvedValue(mockTasks as any);

        await downloads.initialize();

        // Allow store to update
        await new Promise(r => setTimeout(r, 10));

        const tasks = get(downloads);
        expect(tasks.length).toBe(3);
        expect(tasks.find(t => t.id === 'activity-2023-1')?.status).toBe('pending');
    });
});
