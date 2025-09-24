import { test, expect } from '@playwright/test';

const MOCK_TOKEN = {
	access_token: 'mock-access-token',
	refresh_token: 'mock-refresh',
	expires_in: 3600,
	ts: Date.now() / 1000,
	scope: 'activity weight',
	token_type: 'Bearer',
	user_id: 'TESTUSER'
};

test.describe('Dashboard Smoke Test', () => {
	test.beforeEach(async ({ context }) => {
		await context.addInitScript(
			(token) => {
				window.localStorage.setItem('fitbit_token', JSON.stringify(token));
			},
			MOCK_TOKEN
		);
	});

	test('should load the dashboard and display main components', async ({ page }) => {
		await page.goto('/dashboard');
		await expect(page.getByRole('heading', { name: 'Fitbit to Garmin' })).toBeVisible();
        await expect(page.getByText('Data Types')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Add to Queue' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Download Completed' })).not.toBeVisible();
        await expect(page.getByRole('button', { name: 'Retry Failed' })).not.toBeVisible();
        // The table is only visible if there are tasks, so we don't assert on it in the smoke test.
	});
});
