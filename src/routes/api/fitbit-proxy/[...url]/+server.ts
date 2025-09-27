import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

const FITBIT_API_BASE_URL = 'https://api.fitbit.com';

export const fallback: RequestHandler = async ({ request, params }) => {
	const path = params.url;

	if (!path) {
		throw error(400, 'API path is required');
	}

	const targetUrl = `${FITBIT_API_BASE_URL}/${path}`;

	const fwdHeaders = new Headers(request.headers);
	fwdHeaders.delete('host');
	fwdHeaders.delete('connection');
	fwdHeaders.delete('content-length');

	// Read the body to a string to avoid streaming issues with the proxy.
	const body = request.method === 'POST' ? await request.text() : null;

	try {
		const response = await fetch(targetUrl, {
			method: request.method,
			headers: fwdHeaders,
			body: body
		});

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