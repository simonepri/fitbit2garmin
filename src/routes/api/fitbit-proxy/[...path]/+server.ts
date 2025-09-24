import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const API_BASE_URL = 'https://api.fitbit.com';

const handler: RequestHandler = async ({ params, request, url, fetch }) => {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader) {
		throw error(401, 'Unauthorized');
	}

	const apiUrl = `${API_BASE_URL}/${params.path}${url.search}`;

	try {
		const response = await fetch(apiUrl, {
			method: request.method,
			headers: {
				Authorization: authHeader
			},
			body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
			duplex: 'half' // Required for streaming request bodies
		});

		// Stream the response back to the client, including all headers
		return response;
	} catch (e: any) {
		console.error('Error in Fitbit proxy:', e);
		throw error(e.status || 500, e.body?.message || 'Proxy request failed');
	}
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const HEAD = handler;
