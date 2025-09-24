import { test, expect } from '@playwright/test';
import JSZip from 'jszip';

const MOCK_TOKEN = {
	access_token: 'mock-access-token',
	refresh_token: 'mock-refresh',
	expires_in: 3600,
	ts: Date.now() / 1000,
	scope: 'activity weight',
	token_type: 'Bearer',
	user_id: 'TESTUSER'
};

declare global {
    interface Window {
        verifyZipContents: (base64data: string) => void;
    }
}

test.describe('Download Flow', () => {
    let zipVerifiedPromise: Promise<void>;
    let resolveZipVerified: () => void;

	test.beforeEach(async ({ context }) => {
        zipVerifiedPromise = new Promise(resolve => {
            resolveZipVerified = resolve;
        });

		await context.exposeFunction('verifyZipContents', async (base64data: string) => {
			try {
				const buffer = Buffer.from(base64data, 'base64');
				const zip = await JSZip.loadAsync(buffer);

				expect(zip.files['weight/2023-01/weight-2023-1.csv']).toBeDefined();
                expect(zip.files['activity/2023-01/activity-2023-1.csv']).toBeDefined();
                expect(zip.files['tcx/2023-01/tcx-123.tcx']).toBeDefined();
                expect(zip.files['tcx/2023-01/tcx-456.tcx']).toBeUndefined();

                const weightCsv = await zip.files['weight/2023-01/weight-2023-1.csv'].async('string');
                expect(weightCsv).toContain('2023-01-01,80,25,20');

				resolveZipVerified();
			} catch (error) {
				console.error('Error verifying zip file:', error);
			}
		});

		await context.addInitScript(() => {
			window.saveAs = (blob: Blob) => {
				const reader = new FileReader();
				reader.onloadend = () => {
					const base64data = (reader.result as string).split(',')[1];
					window.verifyZipContents(base64data);
				};
				reader.readAsDataURL(blob);
			};
		});

		await context.addInitScript(
			(token) => { window.localStorage.setItem('fitbit_token', JSON.stringify(token)); },
			MOCK_TOKEN
		);

		await context.route('/api/fitbit-proxy/**', async (route) => {
			const url = new URL(route.request().url());
			if (url.pathname.includes('.tcx')) {
				if (url.pathname.includes('123.tcx')) {
					const dummyData = '<Activity><Lap StartTime="2023-01-10T10:00:00.000Z"></Lap></Activity>'.repeat(20);
					await route.fulfill({ body: `<tcx>${dummyData}</tcx>`, contentType: 'application/vnd.garmin.tcx+xml' });
				} else {
					await route.fulfill({ status: 500 });
				}
			} else if (url.pathname.includes('activities/list')) {
				await route.fulfill({ json: { activities: [{ logId: 123, originalStartTime: '2023-01-10T10:00:00.000Z', tcxLink: true }, { logId: 456, originalStartTime: '2023-01-15T12:00:00.000Z', tcxLink: true }], pagination: { next: '' } } });
			} else if (url.pathname.includes('/activities/')) {
				const resource = url.pathname.split('/')[7];
				await route.fulfill({ json: { [`activities-${resource}`]: [{ dateTime: '2023-01-01', value: '100' }] } });
			} else if (url.pathname.includes('body/log/weight')) {
				await route.fulfill({ json: { weight: [{ date: '2023-01-01', weight: 80, bmi: 25, fat: 20 }] } });
			} else {
				await route.fulfill({ status: 404 });
			}
		});
	});

	test('should allow a full user journey', async ({ page }) => {
		await page.goto('/dashboard');
		await expect(page.getByRole('heading', { name: 'Fitbit to Garmin' })).toBeVisible();

		await page.locator('#start-month').selectOption('0');
		await page.locator('select').nth(1).selectOption('2023');
		await page.locator('#end-month').selectOption('0');
		await page.locator('select').nth(3).selectOption('2023');
		await page.getByRole('button', { name: 'Add to Queue' }).click();

		const weightRow = page.locator('[data-testid="task-row-weight-2023-1"]');
		const activityRow = page.locator('[data-testid="task-row-activity-2023-1"]');
		const tcxRow = page.locator('[data-testid="task-row-tcx-2023-1"]');

		await expect(weightRow.locator('span.bg-green-200')).toBeVisible({ timeout: 20000 });
        await expect(activityRow.locator('span.bg-green-200')).toBeVisible();
		await expect(tcxRow.locator('span.bg-red-200')).toBeVisible();
		await expect(tcxRow.getByText('1 / 2 completed')).toBeVisible();
        await expect(tcxRow.getByText('(1 failed)')).toBeVisible();

        await page.getByRole('button', { name: 'Add to Queue' }).click();
        await expect(page.getByText('No new tasks were added')).toBeVisible();
        await expect(page.locator('[data-testid^="task-row-"]')).toHaveCount(3);

        page.on('dialog', dialog => dialog.accept());
        await tcxRow.getByRole('button', { name: 'Retry' }).click();

        await expect(tcxRow.locator('span.bg-blue-200')).toBeVisible();
		await expect(tcxRow.locator('span.bg-red-200')).toBeVisible({ timeout: 10000 });

		await page.getByRole('button', { name: /Download All/ }).click();
		await expect(page.getByText('Download started!')).toBeVisible();

        await zipVerifiedPromise;
	});
});
