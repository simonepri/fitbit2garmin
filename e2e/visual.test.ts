import { test, expect } from '@playwright/test';

test.describe('Visual Tests', () => {
	test.beforeEach(async ({ page }) => {
		// Mock Fitbit API responses with realistic data
		await page.route(/.*\/api\/fitbit-proxy\/.*/, async (route) => {
			const url = route.request().url();
			if (url.includes('body/log/weight')) {
				return route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ weight: [{ date: '2023-01-10', weight: 70, bmi: 22, fat: 15 }] })
				});
			}
			if (url.includes('/activities/list.json')) {
				return route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						activities: [{ logId: '12345', logType: 'run', startTime: '2023-01-10T10:00:00.000' }]
					})
				});
			}
			if (url.includes('.tcx')) {
				return route.fulfill({
					status: 200,
					contentType: 'application/vnd.garmin.tcx+xml',
					body: '<tcx>mock tcx data</tcx>'.repeat(20)
				});
			}
			if (url.includes('/activities/')) {
				const resource = url.split('/activities/')[1].split('/')[0];
				return route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						[`activities-${resource}`]: [{ dateTime: '2023-01-10', value: '123' }]
					})
				});
			}
			return route.fulfill({ status: 200, body: '{}' });
		});

		await page.route(/.*\/oauth2\/token/, (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					access_token: 'mock_access_token',
					refresh_token: 'mock_refresh_token',
					user_id: 'mock_user_id',
					expires_in: 3600
				})
			})
		);
	});

	test('Home Page', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveScreenshot('home-page-dark.png', { fullPage: true });

		await page.evaluate(() => document.documentElement.classList.remove('dark'));
		await expect(page).toHaveScreenshot('home-page-light.png', { fullPage: true });
	});

	test('Download Dashboard - Empty', async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => {
			localStorage.setItem('fitbit-auth', JSON.stringify({ accessToken: 'test', userId: 'test-user' }));
		});
		await page.goto('/download');
		await expect(page.getByRole('heading', { name: 'Download Dashboard' })).toBeVisible();

		await expect(page).toHaveScreenshot('dashboard-empty-dark.png', { fullPage: true });

		await page.evaluate(() => document.documentElement.classList.remove('dark'));
		await expect(page).toHaveScreenshot('dashboard-empty-light.png', { fullPage: true });
	});

	test('Download Dashboard - With Tasks', async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => {
			localStorage.setItem(
				'fitbit-auth',
				JSON.stringify({ accessToken: 'test', userId: 'test-user' })
			);
		});
		await page.goto('/download');
		await expect(page.getByRole('button', { name: 'Add to Download Queue' })).toBeVisible();

		// Add tasks via UI
		await page.getByLabel('Start Month').selectOption({ label: 'January' });
		await page.getByLabel('Start Year').selectOption({ label: '2023' });
		await page.getByLabel('End Month').selectOption({ label: 'February' });
		await page.getByLabel('End Year').selectOption({ label: '2023' });
		await page.getByLabel('Weight').check();
		await page.getByLabel('Activity').check();
		await page.getByLabel('Tcx').check();
		await page.getByRole('button', { name: 'Add to Download Queue' }).click();

		await expect(page.getByRole('cell', { name: 'WEIGHT' }).first()).toBeVisible();
		// Wait for all tasks to be processed for a stable screenshot
		await expect(page.getByText('Status: idle')).toBeVisible({ timeout: 20000 });

		await expect(page).toHaveScreenshot('dashboard-populated-dark.png', { fullPage: true });

		await page.evaluate(() => document.documentElement.classList.remove('dark'));
		await expect(page).toHaveScreenshot('dashboard-populated-light.png', { fullPage: true });
	});

	test('Logout Modal', async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => {
			localStorage.setItem(
				'fitbit-auth',
				JSON.stringify({ accessToken: 'test', userId: 'test-user' })
			);
		});
		await page.goto('/download');
		await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();

		await page.getByRole('button', { name: 'Logout' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		await expect(page).toHaveScreenshot('logout-modal-dark.png', { fullPage: true });

		await page.evaluate(() => document.documentElement.classList.remove('dark'));
		await expect(page).toHaveScreenshot('logout-modal-light.png', { fullPage: true });
	});
});