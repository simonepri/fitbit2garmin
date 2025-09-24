import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import * as fitbitApi from '$lib/server/fitbit/api';

export const GET = async ({ cookies }) => {
	const state = fitbitApi.getOauth2AuthorizationState();
	const codeVerifier = fitbitApi.getOauth2AuthorizationCodeVerifier();
	const codeChallenge = await fitbitApi.getOauth2AuthorizationCodeChallenge(codeVerifier);

	cookies.set('fitbit_oauth_state', state, {
		path: '/',
		httpOnly: true,
		maxAge: 60 * 10 // 10 minutes
	});
	cookies.set('fitbit_oauth_code_verifier', codeVerifier, {
		path: '/',
		httpOnly: true,
		maxAge: 60 * 10 // 10 minutes
	});

	const authUrl = fitbitApi.getOauth2AuthorizationUrl(
		env.FITBIT_CLIENT_ID,
		env.FITBIT_REDIRECT_URI,
		state,
		'activity weight heartrate location', // scope
		codeChallenge
	);

	throw redirect(307, authUrl);
};
