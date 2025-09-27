import { test, expect } from '@playwright/test';

test.describe('Full application flow', () => {
	test.beforeEach(async ({ context }) => {
		await context.route('/api/fitbit-proxy/**', async (route) => {
			const url = route.request().url();
			if (url.includes('oauth2/token')) {
				return route.fulfill({
					status: 200,
					json: {
						access_token: 'mock_access_token',
						refresh_token: 'mock_refresh_token',
						expires_in: 3600,
						user_id: 'mock_user_id',
						scope: 'weight activity location',
						token_type: 'Bearer'
					}
				});
			}
			if (url.includes('/body/log/weight/date')) {
				return route.fulfill({
					status: 200,
					json: { weight: [{ date: '2023-01-15', weight: 70, bmi: 22, fat: 15 }] }
				});
			}
			if (url.includes('/activities/list.json')) {
				return route.fulfill({
					status: 200,
					json: {
						activities: [
							{ logId: 12345, originalStartTime: '2023-01-10T10:00:00.000', logType: 'manual' }
						],
						pagination: { next: '' }
					}
				});
			}
			if (url.includes('/activities/12345.tcx')) {
				return route.fulfill({
					status: 200,
					body: '<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase>...TCX data...</TrainingCenterDatabase>'.repeat(
						20
					)
				});
			}
			if (url.includes('/activities/steps/date')) {
				return route.fulfill({
					status: 200,
					json: { 'activities-steps': [{ dateTime: '2023-01-15', value: '5000' }] }
				});
			}
			// Default mock for other activity time series
			return route.fulfill({
				status: 200,
				json: { 'activities-calories': [{ dateTime: '2023-01-15', value: '2500' }] }
			});
		});
	});

	test('should allow a user to login, queue downloads, and see results', async ({ page }) => {
		// --- 1. Simulate Auth Callback by bypassing the redirect flow ---
		// First, set the necessary state in localStorage that the callback page expects.
		await page.goto('/'); // Go to a page to get a context for localStorage
		await page.evaluate(() => {
			const state = {
				token: null,
				rateLimit: { limit: 150, remaining: 150, reset: 3600, resetDate: 0 },
				codeVerifier: 'mock_code_verifier' // This is the critical piece of state.
			};
			localStorage.setItem('fitbit-api-state', JSON.stringify(state));
		});

		// Now, navigate directly to the auth callback page.
		await page.goto('/fitbit-auth?code=mock_code&state=mock_state');

		// --- 2. Download Dashboard ---
		// The auth callback page should now succeed and redirect to the dashboard.
		await page.waitForURL('/download');

		await expect(page.locator('h1')).not.toBeVisible();
		await expect(page.getByRole('button', { name: 'Add to Queue' })).toBeVisible();

		// --- 3. Add tasks to the queue ---
		await page.getByLabel('Weight').check();
		await page.getByLabel('Tcx').check();

		const alertPromise = page.waitForEvent('dialog');
		await page.getByRole('button', { name: 'Add to Queue' }).click();
		const alert = await alertPromise;
		// The default date range is Jan to current month (September). 9 months * 2 types = 18 tasks.
		expect(alert.message()).toContain('18 new tasks added');
		await alert.dismiss();

		// --- 4. Verify tasks in the table ---
		const queueTable = page.locator('table');
		await expect(queueTable).toBeVisible();
		await expect(queueTable.getByText('Completed')).toHaveCount(18, { timeout: 20000 });

		// --- 5. Test Action Buttons ---
		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Download Completed' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe('fitbit_export.zip');

		page.on('dialog', (dialog) => dialog.accept());
		await page.getByRole('button', { name: 'Erase Data' }).click();
		await expect(queueTable).not.toBeVisible();

		// --- 6. Test Logout ---
		await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
		await page.getByRole('button', { name: 'Logout' }).click();
		await page.waitForURL('/');
		await expect(page.locator('h1')).toHaveText(/Fitbit to Garmin Data Exporter/);
	});
});
