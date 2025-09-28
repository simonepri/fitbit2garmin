import { error } from '@sveltejs/kit';

const FITBIT_API_URL = 'https://api.fitbit.com';

export const fallback = async ({ request, params }) => {
	const url = new URL(request.url);
	const newUrl = `${FITBIT_API_URL}/${params.path}${url.search}`;

	const options: RequestInit = {
		method: request.method,
		headers: {
			Authorization: request.headers.get('Authorization') || '',
			'Content-Type': request.headers.get('Content-Type') || ''
		},
		body: request.body
	};

	// The 'duplex' property is required for streaming request bodies but is not
	// yet in the default type definitions.
	// @ts-expect-error - duplex is not in the type definition yet
	options.duplex = 'half';

	const response = await fetch(newUrl, options);

	// Check if the response is OK, if not, forward the error
	if (!response.ok) {
		throw error(response.status, await response.text());
	}

	// Stream the response back to the client
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: {
			'Content-Type': response.headers.get('Content-Type') || '',
			'fitbit-rate-limit-limit': response.headers.get('fitbit-rate-limit-limit') || '',
			'fitbit-rate-limit-remaining': response.headers.get('fitbit-rate-limit-remaining') || '',
			'fitbit-rate-limit-reset': response.headers.get('fitbit-rate-limit-reset') || ''
		}
	});
};
