import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

const FITBIT_API_BASE_URL = 'https://api.fitbit.com';

export const fallback: RequestHandler = async ({ request, params }) => {
	const path = params.url;

	if (!path) {
		throw error(400, 'API path is required');
	}

	const targetUrl = `${FITBIT_API_BASE_URL}/${path}`;

	// Reconstruct the original headers, removing host-specific ones
	const fwdHeaders = new Headers(request.headers);
	fwdHeaders.delete('host');
	fwdHeaders.delete('connection');

	try {
		// The `duplex: 'half'` property is required for streaming request bodies
		// in Node's `fetch`. We cast to `any` to bypass a TypeScript lib issue.
		const response = await fetch(targetUrl, {
			method: request.method,
			headers: fwdHeaders,
			body: request.body,
			duplex: 'half'
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		// Create a new response with the streamed body from the target
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	} catch (err) {
		console.error('Proxy error:', err);
		throw error(500, 'Proxy request failed');
	}
};