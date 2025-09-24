import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import * as fitbitApi from '$lib/server/fitbit/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');

	const savedState = cookies.get('fitbit_oauth_state');
	const codeVerifier = cookies.get('fitbit_oauth_code_verifier');

	// Clean up cookies
	cookies.delete('fitbit_oauth_state', { path: '/' });
	cookies.delete('fitbit_oauth_code_verifier', { path: '/' });

	if (!code || !state || !savedState || state !== savedState) {
		throw error(400, 'Invalid state or code');
	}
	if (!codeVerifier) {
		throw error(400, 'Missing code verifier');
	}

	try {
		const token = await fitbitApi.getToken(
			env.FITBIT_CLIENT_ID,
			env.FITBIT_REDIRECT_URI,
			code,
			codeVerifier
		);
		return { token };
	} catch (e: any) {
		console.error('Error getting token:', e);
		// Redirect to a dedicated error page
		throw redirect(307, `/auth/error?message=${encodeURIComponent(e.body?.message || 'Authentication failed')}`);
	}
};
