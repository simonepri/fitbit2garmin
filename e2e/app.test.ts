import { test, expect } from '@playwright/test';

test('full user flow', async ({ page }) => {
	// Mock Fitbit API responses
	await page.route(/.*\/api\/fitbit-proxy\/.*/, async (route) => {
		const url = route.request().url();
		if (url.includes('body/log/weight')) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ weight: [{ date: '2023-01-10', weight: 70, bmi: 22, fat: 15 }] })
			});
		} else if (url.includes('/activities/list.json')) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ activities: [] })
			});
		} else if (url.includes('/activities/calories/date')) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ 'activities-calories': [] })
			});
		} else if (url.includes('/activities/steps/date')) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ 'activities-steps': [] })
			});
		} else {
			await route.fulfill({ status: 200, body: '{}' });
		}
	});

	// 1. Home Page
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Fitbit2Garmin' })).toBeVisible();

	// Mock token exchange
	await page.route(/.*\/oauth2\/token/, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				access_token: 'mock_access_token',
				refresh_token: 'mock_refresh_token',
				user_id: 'mock_user_id',
				expires_in: 3600
			})
		});
	});

	// Seed localStorage with a mock code verifier, which would normally be set
	// before redirecting the user to Fitbit.
	await page.evaluate(() => {
		localStorage.setItem(
			'fitbit-auth',
			JSON.stringify({
				codeVerifier: 'mock_code_verifier'
			})
		);
	});

	// 2. Simulate redirect from Fitbit and land on the dashboard
	await page.goto('/fitbit-auth?code=mock_code');
	await page.waitForURL('/download');
	await expect(page.getByRole('heading', { name: 'Download Dashboard' })).toBeVisible();

	// Wait for the form to be ready before interacting with it
	await expect(page.getByRole('button', { name: 'Add to Download Queue' })).toBeVisible();

	// 3. Add to Queue
	await page.getByLabel('Start Month').selectOption({ label: 'January' });
	await page.getByLabel('Start Year').selectOption({ label: '2023' });
	await page.getByLabel('End Month').selectOption({ label: 'January' });
	await page.getByLabel('End Year').selectOption({ label: '2023' });
	await page.getByLabel('Weight').check();
	await page.getByRole('button', { name: 'Add to Download Queue' }).click();

	await expect(page.getByText('1 new tasks added to the queue.')).toBeVisible();

	// 4. Verify Queue Table
	await expect(page.getByRole('cell', { name: 'WEIGHT' })).toBeVisible();
	await expect(page.getByRole('cell', { name: '2023-01' })).toBeVisible();

	// Wait for the task to complete
	await expect(page.getByRole('cell', { name: 'completed' })).toBeVisible({ timeout: 10000 });
	await expect(page.getByRole('cell', { name: '1/1' })).toBeVisible();

	// 5. Download Completed
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download Completed' }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe('fitbit_export.zip');

	// 6. Logout
	await page.getByRole('button', { name: 'Logout' }).click();
	await expect(page.getByText('Are you sure you want to log out?')).toBeVisible();
	await page.getByRole('button', { name: 'Logout' }).nth(1).click();
	await page.waitForURL('/');
	await expect(page.getByRole('button', { name: 'Download your data' })).toBeVisible();
});
