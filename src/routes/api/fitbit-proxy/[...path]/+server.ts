import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import * as fitbitApi from '$lib/server/fitbit/api';
import type { FitbitToken } from '$lib/types';

const API_BASE_URL = 'https://api.fitbit.com';

const handler: RequestHandler = async ({ params, request, url }) => {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		throw error(401, 'Unauthorized: Token not provided');
	}

	let token: FitbitToken;
	try {
		// The full token object is JSON-stringified and sent as the bearer token
		token = JSON.parse(authHeader.substring('Bearer '.length));
	} catch (e) {
		throw error(400, 'Invalid token format');
	}

	let refreshedToken: FitbitToken | null = null;
	const onTokenRefresh = (newToken: FitbitToken) => {
		refreshedToken = newToken;
	};

	const apiUrl = `${API_BASE_URL}/${params.path}${url.search}`;

	try {
		const result = await fitbitApi.apiCall(
			apiUrl,
			token,
			env.FITBIT_CLIENT_ID,
			onTokenRefresh,
			{
				method: request.method,
				headers: {
					'Content-Type': request.headers.get('Content-Type') || 'application/json'
				},
				body: request.method !== 'GET' ? await request.arrayBuffer() : undefined
			}
		);

		const headers = new Headers();
		if (refreshedToken) {
			headers.set('X-Refreshed-Token', JSON.stringify(refreshedToken));
		}

        if (result instanceof ArrayBuffer) {
            headers.set('Content-Type', 'application/octet-stream');
            return new Response(result, { headers });
        }

		return json(result, { headers });

	} catch (e: any) {
		console.error('Error in Fitbit proxy:', e);
		throw error(e.status || 500, e.body?.message || 'Proxy request failed');
	}
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
