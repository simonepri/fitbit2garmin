import type { RequestHandler } from '@sveltejs/kit';

const FITBIT_API_URL = 'https://api.fitbit.com';

const handler: RequestHandler = async ({ request, params }) => {
	const { path } = params;
	const url = new URL(`${FITBIT_API_URL}/${path}`);

	// Append query parameters from the original request
	url.search = new URL(request.url).search;

	const headers = new Headers(request.headers);
	// The host header must be changed to the target host
	headers.set('host', new URL(FITBIT_API_URL).host);

	const response = await fetch(url.toString(), {
		method: request.method,
		headers,
		body: request.body,
		// @ts-expect-error - duplex is a valid option for streaming but not in all TS envs
		duplex: 'half'
	});

	// Return the response from the Fitbit API, including headers and status
	return response;
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
