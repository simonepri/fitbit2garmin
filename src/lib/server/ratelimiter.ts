export class RateLimiter {
	private limit: number;
	private remaining: number;
	private reset: number; // UTC timestamp in seconds

	private queue: (() => void)[] = [];
	private processing = false;

	constructor(initialLimit = 150, initialPeriod = 3600) {
		this.limit = initialLimit;
		this.remaining = initialLimit;
		this.reset = Math.floor(Date.now() / 1000) + initialPeriod;
	}

	async acquire(): Promise<void> {
		return new Promise((resolve) => {
			this.queue.push(resolve);
			this.processQueue();
		});
	}

	updateFromHeaders(headers: Headers): void {
		const limit = headers.get('fitbit-rate-limit-limit');
		const remaining = headers.get('fitbit-rate-limit-remaining');
		const reset = headers.get('fitbit-rate-limit-reset');

		if (limit) this.limit = parseInt(limit, 10);
		if (remaining) this.remaining = parseInt(remaining, 10);
		if (reset) {
			const now = Math.floor(Date.now() / 1000);
			this.reset = now + parseInt(reset, 10);
		}
	}

	private async processQueue() {
		if (this.processing || this.queue.length === 0) {
			return;
		}

		this.processing = true;

		while (this.queue.length > 0) {
			const now = Math.floor(Date.now() / 1000);

			if (now >= this.reset) {
				this.remaining = this.limit;
			}

			if (this.remaining > 0) {
				const resolve = this.queue.shift();
				if (resolve) {
					this.remaining--;
					resolve();
				}
			} else {
				const delay = (this.reset - now) * 1000;
				await new Promise((r) => setTimeout(r, delay > 0 ? delay : 1000));
				// After waiting, loop will re-check conditions
			}
		}

		this.processing = false;
	}
}
