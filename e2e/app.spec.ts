import { test, expect, type Page } from '@playwright/test';

// Helper function to mock the Fitbit API
async function mockFitbitApi(page: Page) {
	// Mock the OAuth2 token exchange
	await page.route('**/api/fitbit-proxy/oauth2/token', async (route) => {
		const body = route.request().postData() || '';
		if (body.includes('grant_type=authorization_code')) {
			await route.fulfill({
				json: {
					access_token: 'mock_access_token',
					refresh_token: 'mock_refresh_token',
					user_id: 'mock_user_id',
					scope: 'weight activity profile',
					token_type: 'Bearer',
					expires_in: 3600
				}
			});
		} else if (body.includes('grant_type=refresh_token')) {
			await route.fulfill({
				json: {
					access_token: 'mock_refreshed_access_token',
					refresh_token: 'mock_refreshed_refresh_token',
					expires_in: 3600
				}
			});
		}
	});

	// Mock the API calls for data fetching
	await page.route('**/api/fitbit-proxy/1/user/-/body/log/weight/date/**', async (route) => {
		await route.fulfill({
			json: {
				weight: [{ date: '2023-01-01', weight: 80 }]
			}
		});
	});

	await page.route('**/api/fitbit-proxy/1/user/-/activities/list.json**', async (route) => {
		await route.fulfill({
			json: {
				activities: [
					{
						startTime: '2023-01-15T10:00:00.000',
						activityName: 'Walk',
						calories: 150,
						logId: 12345
					}
				]
			}
		});
	});

	await page.route('**/api/fitbit-proxy/1/user/-/activities/12345.tcx', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/vnd.garmin.tcx+xml',
			body: '<TrainingCenterDatabase/>'
		});
	});
}

test.describe('Full User Flow', () => {
	test.beforeEach(async ({ page }) => {
		await mockFitbitApi(page);
	});

	test('should complete the entire user journey', async ({ page }) => {
		// 1. Start at the home page
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Fitbit to Garmin Exporter' })).toBeVisible();

		// 2. Login Flow
		// Intercept the navigation to Fitbit to swallow it, preventing the test from leaving the page.
		await page.route('https://www.fitbit.com/oauth2/authorize?**', (route) => {
			// Just fulfill the request with a no-op response. The important part is that
			// the client-side code that sets localStorage has already run.
			return route.fulfill({ status: 204 });
		});

		// Click the login button. This will run the app's handleLogin function,
		// which sets the necessary items in localStorage and attempts to navigate.
		await page.getByRole('button', { name: 'Login with Fitbit & Download Data' }).click();

		// Now that the client-side logic has run, retrieve the state and verifier from localStorage.
		const state = await page.evaluate(() => localStorage.getItem('fitbitOauthState'));
		const codeVerifier = await page.evaluate(() => localStorage.getItem('fitbitOauthCodeVerifier'));

		// Ensure the values were set before proceeding.
		expect(state).not.toBeNull();
		expect(codeVerifier).not.toBeNull();

		// Manually navigate to the callback URL, simulating the redirect from Fitbit.
		await page.goto(`http://localhost:5173/fitbit-auth?code=mock_code&state=${state}`);

		// 3. Land on Download Dashboard
		await page.waitForURL('**/download');
		await expect(page.getByRole('heading', { name: 'Download Dashboard' })).toBeVisible();

		// 4. Add tasks to the queue
		await page.locator('#start-date-month').selectOption('1');
		await page.locator('#start-date-year').selectOption('2023');
		await page.locator('#end-date-month').selectOption('1');
		await page.locator('#end-date-year').selectOption('2023');
		await page.getByLabel('Weight').check();
		await page.getByLabel('Activity').check();
		await page.getByLabel('TCX').check();
		await page.getByRole('button', { name: 'Add to Download Queue' }).click();

		// 5. Verify tasks appear and complete
		await expect(page.getByRole('cell', { name: 'weight' })).toBeVisible();
		await expect(page.getByRole('cell', { name: 'activity' })).toBeVisible();
		await expect(page.getByRole('cell', { name: 'tcx' })).toBeVisible();
		await expect(page.getByText('Status: Idle')).toBeVisible({ timeout: 10000 });

		// 6. Test Download button
		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Download Completed' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toContain('fitbit-export');

		// 7. Test Clear All button
		page.on('dialog', (dialog) => dialog.accept());
		await page.getByRole('button', { name: 'Clear All' }).click();
		await expect(page.getByRole('cell', { name: 'The queue is empty.' })).toBeVisible();

		// 8. Test Logout
		await page.getByRole('button', { name: 'Logout' }).click();
		await page.waitForURL('**/');
		const localStorageData = await page.evaluate(() =>
			window.localStorage.getItem('fitbitApiState')
		);
		const parsedData = JSON.parse(localStorageData || '{}');
		expect(parsedData.accessToken).toBeNull();
	});
});
