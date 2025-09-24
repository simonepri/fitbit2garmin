import { error } from '@sveltejs/kit';
import { add, format, isAfter } from 'date-fns';

// --- Constants ---
const API_BASE_URL = 'https://api.fitbit.com';
const API_OAUTH2_BASE_URL = 'https://www.fitbit.com/oauth2';
const API_VERSION = 1;
const API_DATE_FORMAT = 'yyyy-MM-dd';

import type { FitbitToken } from '$lib/types';

// --- PKCE Helpers ---

export function getOauth2AuthorizationCodeVerifier(): string {
	const randomBytes = new Uint8Array(64);
	crypto.getRandomValues(randomBytes);
	return Buffer.from(randomBytes).toString('base64url');
}

export async function getOauth2AuthorizationCodeChallenge(
	codeVerifier: string
): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(codeVerifier);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return Buffer.from(digest).toString('base64url');
}

export function getOauth2AuthorizationState(): string {
	const randomBytes = new Uint8Array(64);
	crypto.getRandomValues(randomBytes);
	return Buffer.from(randomBytes).toString('hex');
}

// --- URL Builders ---

export function getOauth2AuthorizationUrl(
	clientId: string,
	redirectUri: string,
	state: string,
	scope: string,
	codeChallenge: string
): string {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		state: state,
		scope: scope,
		code_challenge: codeChallenge,
		code_challenge_method: 'S256',
		response_type: 'code'
	});
	return `${API_OAUTH2_BASE_URL}/authorize?${params.toString()}`;
}

export function getOauth2TokenUrl(): string {
	return `${API_BASE_URL}/oauth2/token`;
}

export function getOauth2TokenUrlPayload(
	clientId: string,
	redirectUri: string,
	code: string,
	codeVerifier: string
): URLSearchParams {
	return new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		code: code,
		code_verifier: codeVerifier,
		grant_type: 'authorization_code'
	});
}

export function getOauth2RefreshTokenPayload(
    clientId: string,
    refreshToken: string
): URLSearchParams {
    return new URLSearchParams({
        client_id: clientId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
    });
}

function getAuthorizationHeaders(bearerToken: string): Headers {
	return new Headers({ Authorization: `Bearer ${bearerToken}` });
}

// --- API Endpoint URL Builders ---

// https://dev.fitbit.com/build/reference/web-api/activity/get-activity-log-list/
export function getActivityLogListUrl(
	startDate: Date,
	offset = 0,
	limit = 100,
	sort: 'asc' | 'desc' = 'asc',
	user = '-'
): string {
	const params = new URLSearchParams({
		offset: offset.toString(),
		limit: limit.toString(),
		sort: sort,
		afterDate: format(startDate, API_DATE_FORMAT)
	});
	return `${API_BASE_URL}/${API_VERSION}/user/${user}/activities/list.json?${params.toString()}`;
}

// https://dev.fitbit.com/build/reference/web-api/activity/get-activity-tcx/
export function getActivityTcxUrl(logId: number, user = '-'): string {
	return `${API_BASE_URL}/${API_VERSION}/user/${user}/activities/${logId}.tcx`;
}

// https://dev.fitbit.com/build/reference/web-api/body-timeseries/get-weight-timeseries-by-date-range/
export function getWeightTimeseriesUrl(startDate: Date, endDate: Date, user = '-'): string {
	if (isAfter(startDate, endDate)) {
		throw new Error(`Start date ${startDate} is after end date ${endDate}.`);
	}
	// Fitbit API allows max 31 days range for weight
	if (isAfter(endDate, add(startDate, { days: 30 }))) {
		throw new Error(
			`End date ${endDate} is more than 31 days apart from start date ${startDate}.`
		);
	}
	const start = format(startDate, API_DATE_FORMAT);
	const end = format(endDate, API_DATE_FORMAT);
	return `${API_BASE_URL}/${API_VERSION}/user/${user}/body/log/weight/date/${start}/${end}.json`;
}

// https://dev.fitbit.com/build/reference/web-api/activity-timeseries/get-activity-timeseries-by-date-range/
export function getActivityTimeseriesUrl(
	resource: string,
	startDate: Date,
	endDate: Date,
	user = '-'
): string {
	if (isAfter(startDate, endDate)) {
		throw new Error(`Start date ${startDate} is after end date ${endDate}.`);
	}
	const start = format(startDate, API_DATE_FORMAT);
	const end = format(endDate, API_DATE_FORMAT);
	return `${API_BASE_URL}/${API_VERSION}/user/${user}/activities/${resource}/date/${start}/${end}.json`;
}

export function getActivityTimeseriesResources(): string[] {
	return [
		'activityCalories',
		'calories',
		'distance',
		'floors',
		'minutesSedentary',
		'minutesLightlyActive',
		'minutesFairlyActive',
		'minutesVeryActive',
		'steps'
	];
}

// --- Core API Fetcher ---

// A wrapper around the core fetch function to handle token management
export async function apiCall<T>(
    url: string,
    token: FitbitToken,
    clientId: string,
    onTokenRefresh: (newToken: FitbitToken) => void | Promise<void>,
    options: RequestInit = {}
): Promise<T> {
    const isExpired = Date.now() / 1000 > token.ts + token.expires_in;
    if (isExpired) {
        const newToken = await refreshToken(clientId, token.refresh_token);
        await onTokenRefresh(newToken);
        token = newToken;
    }

    const headers = getAuthorizationHeaders(token.access_token);
    if (options.headers) {
        (Object.entries(options.headers) as [string, string][]).forEach(([key, value]) => {
            headers.append(key, value);
        });
    }

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        console.error('Fitbit API Error:', {
            status: response.status,
            statusText: response.statusText,
            url,
            body: errorBody
        });
        const message = errorBody?.errors?.[0]?.message || response.statusText;
        throw error(response.status, `Fitbit API request failed: ${message}`);
    }

    if (response.headers.get('content-type')?.includes('application/json')) {
        return (await response.json()) as T;
    }

    return (await response.arrayBuffer()) as T;

}

// --- Public API Functions ---

export async function getToken(
    clientId: string,
    redirectUri: string,
    code: string,
    codeVerifier: string
): Promise<FitbitToken> {
    const url = getOauth2TokenUrl();
    const payload = getOauth2TokenUrlPayload(clientId, redirectUri, code, codeVerifier);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw error(response.status, `Failed to get token: ${errorBody?.errors?.[0]?.message || response.statusText}`);
    }

    const tokenData = await response.json();
    return { ...tokenData, ts: Math.floor(Date.now() / 1000) };
}

export async function refreshToken(
    clientId: string,
    refreshToken: string
): Promise<FitbitToken> {
    const url = getOauth2TokenUrl();
    const payload = getOauth2RefreshTokenPayload(clientId, refreshToken);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw error(response.status, `Failed to refresh token: ${errorBody?.errors?.[0]?.message || response.statusText}`);
    }

    const tokenData = await response.json();
    return { ...tokenData, ts: Math.floor(Date.now() / 1000) };
}

export async function getWeightTimeseries(
	token: FitbitToken,
    clientId: string,
    onTokenRefresh: (newToken: FitbitToken) => void,
	startDate: Date,
	endDate: Date
): Promise<{ weight: any[] }> {
	const url = getWeightTimeseriesUrl(startDate, endDate);
	return apiCall(url, token, clientId, onTokenRefresh);
}

export async function getActivityLogList(
    token: FitbitToken,
    clientId: string,
    onTokenRefresh: (newToken: FitbitToken) => void,
	startDate: Date,
	endDate: Date
): Promise<{ activities: any[]; pagination: { next?: string } }> {
	const allActivities = [];
	let url: string | undefined = getActivityLogListUrl(startDate);

	while (url) {
		const data: { activities: any[]; pagination: { next?: string } } = await apiCall(
			url,
            token,
            clientId,
            onTokenRefresh
		);
		if (!data.activities || data.activities.length === 0) {
			break;
		}

		const newActivities = data.activities.filter((a) =>
			isAfter(endDate, new Date(a.originalStartTime)) || format(endDate, 'yyyy-MM-dd') === format(new Date(a.originalStartTime), 'yyyy-MM-dd')
		);

		allActivities.push(...newActivities);

		if (newActivities.length < data.activities.length) {
			// We've reached the end of the desired date range
			url = undefined;
		} else {
			url = data.pagination.next;
		}
	}
	return { activities: allActivities, pagination: {} };
}


export async function getActivityTcx(
    token: FitbitToken,
    clientId: string,
    onTokenRefresh: (newToken: FitbitToken) => void,
	logId: number
): Promise<ArrayBuffer> {
	const url = getActivityTcxUrl(logId);
	return apiCall(url, token, clientId, onTokenRefresh);
}

export async function getActivityTimeseries(
    token: FitbitToken,
    clientId: string,
    onTokenRefresh: (newToken: FitbitToken) => void,
	startDate: Date,
	endDate: Date
): Promise<any[]> {
	const activityByDate: Record<string, any> = {};
	const resources = getActivityTimeseriesResources();

	for (const resource of resources) {
		const url = getActivityTimeseriesUrl(resource, startDate, endDate);
		const data: any = await apiCall(url, token, clientId, onTokenRefresh);

		for (const activity of data[`activities-${resource}`]) {
			if (!activityByDate[activity.dateTime]) {
				activityByDate[activity.dateTime] = { date: activity.dateTime };
			}
			activityByDate[activity.dateTime][resource] = activity.value;
		}
	}
	return Object.values(activityByDate);
}
