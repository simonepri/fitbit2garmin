import { test, expect } from '@playwright/test';

test('Full user flow', async ({ page }) => {
	// Mock the Fitbit API endpoints
	await page.route('**/api/fitbit-proxy/1/user/-/profile.json', async (route) => {
		await route.fulfill({
			json: {
				user: {
					encodedId: 'TEST_USER_ID'
				}
			}
		});
	});

	await page.route('**/api/fitbit-proxy/1/user/-/body/log/weight/date/*.json', async (route) => {
		await route.fulfill({
			json: {
				weight: [{ date: '2023-01-01', weight: 70, bmi: 22, fat: 15 }]
			}
		});
	});

	await page.route('**/api/fitbit-proxy/1/user/-/activities/list.json**', async (route) => {
		await route.fulfill({
			json: {
				activities: [],
				pagination: { next: '' }
			}
		});
	});

	await page.route('**/api/fitbit-proxy/1/user/-/activities/**/date/*.json', async (route) => {
		const resource = route.request().url().split('/')[7];
		await route.fulfill({
			json: {
				[`activities-${resource}`]: [{ dateTime: '2023-01-01', value: '100' }]
			}
		});
	});

	// 1. Home Page
	await page.goto('/');
	await expect(
		page.getByRole('heading', { name: 'Download Your Fitbit Data for Garmin' })
	).toBeVisible();

	// 2. Login Flow
	// Intercept the OAuth navigation
	let oauthUrl;
	page.on('request', (request) => {
		if (request.url().startsWith('https://www.fitbit.com/oauth2/authorize')) {
			oauthUrl = request.url();
		}
	});

	await page.getByRole('button', { name: /Login with Fitbit/ }).click();
	await page.waitForRequest(
		(request) => request.url().startsWith('https://www.fitbit.com/oauth2/authorize'),
		{ timeout: 5000 }
	);
	expect(oauthUrl).toBeDefined();

	// Simulate the callback from Fitbit
	const callbackUrl = new URL(oauthUrl);
	const state = callbackUrl.searchParams.get('state');
	await page.goto(`/fitbit-auth?code=mock-code&state=${state}`);

	// Mock the token exchange
	await page.route('https://api.fitbit.com/oauth2/token', async (route) => {
		await route.fulfill({
			json: {
				access_token: 'mock-access-token',
				expires_in: 3600,
				refresh_token: 'mock-refresh-token',
				scope: 'weight activity profile',
				token_type: 'Bearer',
				user_id: 'TEST_USER_ID'
			}
		});
	});

	// 3. Download Dashboard
	await page.waitForURL('/download');
	await expect(page.getByRole('heading', { name: 'Download Dashboard' })).toBeVisible();

	// 4. Add tasks to the queue
	await page.getByRole('checkbox', { name: 'Weight' }).check();
	await page.getByRole('checkbox', { name: 'Activity' }).check();
	await page.getByRole('button', { name: 'Add to Download Queue' }).click();

	// 5. Verify tasks are in the table and complete
	await expect(page.getByRole('cell', { name: 'WEIGHT' })).toBeVisible();
	await expect(page.getByRole('cell', { name: 'ACTIVITY' })).toBeVisible();

	// Wait for tasks to complete
	await expect(page.getByText('Status: idle')).toBeVisible({ timeout: 15000 });
	await expect(page.getByText('Queue: 2/0/0 (C/F/P)')).toBeVisible();

	// 6. Download the ZIP file
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download Completed' }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/fitbit-export-.*\.zip/);

	// 7. Logout
	page.on('dialog', (dialog) => dialog.accept()); // auto-accept confirm dialog
	await page.getByRole('button', { name: 'Logout' }).click();
	await page.waitForURL('/');
	await expect(page.getByRole('button', { name: /Login with Fitbit/ })).toBeVisible();
});