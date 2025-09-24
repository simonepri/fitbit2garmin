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
		const fitbitResponse = await fetch(apiUrl, {
			method: request.method,
			headers: {
				Authorization: authHeader,
                'Content-Type': request.headers.get('Content-Type') || ''
			},
			body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
			duplex: 'half'
		});

        // Create new headers from the original response, but remove
        // the content-encoding header. The SvelteKit server's fetch will
        // have already decompressed the body, so forwarding this header
        // will cause the browser to try to decompress an already-decompressed body.
        const headers = new Headers(fitbitResponse.headers);
        headers.delete('content-encoding');

        // Return a new response with the original body but the modified headers.
        return new Response(fitbitResponse.body, {
            status: fitbitResponse.status,
            statusText: fitbitResponse.statusText,
            headers: headers
        });

	} catch (e: any) {
		console.error('Error in Fitbit proxy:', e);
		throw error(e.status || 500, e.message || 'Proxy request failed');
	}
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const HEAD = handler;
