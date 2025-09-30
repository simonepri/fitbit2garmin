import { test, expect } from '@playwright/test';

test.describe('Full User Journey', () => {
	test.beforeEach(async ({ page }) => {
		// Mock the Fitbit API endpoints
		await page.route('**/oauth2/token', async (route) => {
			const params = new URLSearchParams(route.request().postData() || '');
			if (params.get('grant_type') === 'authorization_code') {
				expect(params.get('code')).toBe('mock_code');
				expect(params.get('code_verifier')).toBe('mock_verifier');

				await route.fulfill({
					status: 200,
					json: {
						access_token: 'mock_access_token',
						refresh_token: 'mock_refresh_token',
						user_id: 'TESTUSER',
						expires_in: 3600,
						scope: 'weight activity',
						token_type: 'Bearer'
					}
				});
			} else {
				await route.continue();
			}
		});

		// Mock the proxy endpoint for API calls
		await page.route('/api/fitbit-proxy/**', async (route) => {
			const url = route.request().url();
			const headers = {
				'fitbit-rate-limit-limit': '150',
				'fitbit-rate-limit-remaining': '149',
				'fitbit-rate-limit-reset': '3600'
			};

			// Only provide data for January requests
			if (url.includes('2023-01')) {
				if (url.includes('/body/log/weight')) {
					await route.fulfill({
						status: 200,
						headers,
						json: {
							weight: [{ date: '2023-01-15', weight: 70, bmi: 22.5, fat: 15 }]
						}
					});
					return;
				} else if (url.includes('/activities/')) {
					const resource = url.match(/activities\/(.*?)\/date/)?.[1] || 'steps';
					await route.fulfill({
						status: 200,
						headers,
						json: {
							[`activities-${resource}`]: [{ dateTime: '2023-01-10', value: '100' }]
						}
					});
					return;
				}
			}
			// For all other requests (e.g., February), return empty data
			await route.fulfill({ status: 200, headers, json: {} });
		});
	});

	test('should complete the auth flow and add tasks to the queue', async ({ page }) => {
		// 1. Home Page
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Fitbit to Garmin Data Exporter' })).toBeVisible();
		await expect(page).toHaveScreenshot('01-home-page-light.png');

		// 2. Dark Mode
		const themeToggleButton = page.locator('nav button').last();
		await themeToggleButton.click();
		await expect(page.locator('html')).toHaveClass(/dark/);
		await expect(page).toHaveScreenshot('02-home-page-dark.png');
		await themeToggleButton.click(); // Reset to light mode

		// 3. Auth Flow
		await page.evaluate(() => {
			sessionStorage.setItem('fitbit_code_verifier', 'mock_verifier');
		});
		await page.goto('/fitbit-auth?code=mock_code');

		// 4. Download Dashboard
		await page.waitForURL('/download');
		await expect(page.getByRole('heading', { name: 'Download Dashboard' })).toBeVisible();
		await expect(page).toHaveScreenshot('03-download-dashboard-empty.png');

		// 5. Add tasks to queue
		await page.locator('[data-testid="start-date-picker"] select').first().selectOption('1'); // Jan
		await page.locator('[data-testid="start-date-picker"] select').last().selectOption('2023');
		await page.locator('[data-testid="end-date-picker"] select').first().selectOption('2'); // Feb
		await page.locator('[data-testid="end-date-picker"] select').last().selectOption('2023');
		await page.getByLabel('tcx').uncheck();

		// 6. Add to Queue
		await page.getByRole('button', { name: 'Add to Download Queue' }).click();

		// Add a small explicit wait to allow the reactive UI to update
		await page.waitForTimeout(100);

		// 7. Verify Tasks in Table
		await expect(page.getByRole('table')).toBeVisible();

		// Asserting the final state is the most robust test.
		// We expect 2 tasks to complete with data, and 2 to complete with "No data".
		await expect(page.getByRole('badge', { name: 'Complete' })).toHaveCount(2, { timeout: 10000 });
		await expect(page.getByRole('badge', { name: 'No data' })).toHaveCount(2, { timeout: 10000 });

		await expect(page).toHaveScreenshot('04-download-dashboard-with-tasks.png');

		// 8. Test Dark Mode with data
		const themeToggleButtonAfterLogin = page.locator('nav button').last();
		await themeToggleButtonAfterLogin.click();
		await expect(page.locator('html')).toHaveClass(/dark/);
		await expect(page).toHaveScreenshot('05-download-dashboard-with-tasks-dark.png');
	});
});