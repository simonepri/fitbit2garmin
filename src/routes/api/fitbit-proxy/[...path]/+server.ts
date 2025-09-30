import { error } from '@sveltejs/kit';

const FITBIT_API_URL = 'https://api.fitbit.com';

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ url, request, params }) => {
	return proxyRequest(url, request, params.path);
};

export const POST = async ({ url, request, params }) => {
	return proxyRequest(url, request, params.path);
};

async function proxyRequest(
	url: URL,
	request: Request,
	path: string
): Promise<Response> {
	const fitbitUrl = new URL(`${FITBIT_API_URL}/${path}${url.search}`);

	const headers = new Headers(request.headers);
	headers.delete('host'); // Let fetch set the correct host

	const fitbitRequest = new Request(fitbitUrl, {
		method: request.method,
		headers: headers,
		body: request.body,
		duplex: 'half' // Required for streaming request bodies
	});

	try {
		const response = await fetch(fitbitRequest);
		return response;
	} catch (e) {
		console.error('Fitbit API proxy error:', e);
		throw error(500, 'Error proxying request to Fitbit API');
	}
}