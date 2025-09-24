import { redirect } from '@sveltejs/kit';
import { get } from 'svelte/store';
import { auth } from '$lib/stores/auth';
import { browser } from '$app/environment';

export const load = async () => {
    if (browser) {
        const token = get(auth);
        if (token) {
            throw redirect(307, '/dashboard');
        }
    }
    return {};
};
