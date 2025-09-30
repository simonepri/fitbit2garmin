import { vi } from 'vitest';

// Mock a comprehensive browser environment for all test files

// Mock SvelteKit modules
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock browser APIs
vi.stubGlobal('btoa', (str: string) => Buffer.from(str).toString('base64'));
vi.stubGlobal('fetch', vi.fn());

const localStorageStore: Record<string, string> = {};
vi.stubGlobal('localStorage', {
	getItem: vi.fn((key) => localStorageStore[key] || null),
	setItem: vi.fn((key, value) => {
		localStorageStore[key] = String(value);
	}),
	removeItem: vi.fn((key) => {
		delete localStorageStore[key];
	}),
	clear: vi.fn(() => {
		for (const key in localStorageStore) {
			delete localStorageStore[key];
		}
	})
});

vi.stubGlobal('window', {
	crypto: {
		subtle: {
			digest: async (algorithm: any, data: any) => {
				const { createHash } = await import('crypto');
				return createHash('sha256').update(data).digest();
			}
		},
		getRandomValues: (array: Uint8Array) => {
			// Vitest runs in Node, so we can use the 'crypto' module
			const { randomFillSync } = require('crypto');
			randomFillSync(array);
			return array;
		}
	},
	location: {
		origin: 'http://localhost:5173'
	},
	// Vitest's stubGlobal doesn't deeply merge, so we have to re-add localStorage here.
	localStorage: global.localStorage
});

// Mock IntersectionObserver for Flowbite components if needed
const intersectionObserverMock = () => ({
  observe: () => null,
  unobserve: () => null,
  disconnect: () => null,
});
vi.stubGlobal('IntersectionObserver', intersectionObserverMock);