import type { RequestHandler } from '@sveltejs/kit';

const FITBIT_API_BASE_URL = 'https://api.fitbit.com';

export const fallback: RequestHandler = async ({ request, params }) => {
	const url = new URL(request.url);
	const fitbitUrl = `${FITBIT_API_BASE_URL}/${params.path}${url.search}`;

	// Create a new request to the Fitbit API, preserving the method, headers, and body
	const proxyRequest = new Request(fitbitUrl, {
		method: request.method,
		headers: request.headers,
		body: request.body
	});

	// Remove headers that should not be forwarded
	proxyRequest.headers.delete('host');
	proxyRequest.headers.delete('connection');

	try {
		const fitbitResponse = await fetch(proxyRequest);

		// Create a new response to send back to the client
		// This streams the body from the Fitbit API response
		const response = new Response(fitbitResponse.body, {
			status: fitbitResponse.status,
			statusText: fitbitResponse.statusText,
			headers: fitbitResponse.headers
		});

		// Remove headers that are controlled by the browser or server
		response.headers.delete('content-encoding');
		response.headers.delete('content-length');

		return response;
	} catch (error) {
		console.error('Fitbit proxy error:', error);
		return new Response('Error connecting to the Fitbit API.', { status: 502 });
	}
};
