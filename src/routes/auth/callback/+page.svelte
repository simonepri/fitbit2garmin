<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth';
	import type { PageData } from './$types';

	export let data: PageData;

	onMount(() => {
		if (data.token) {
			auth.set(data.token);
			goto('/dashboard', { replaceState: true });
		}
	});
</script>

<div class="text-center p-8">
	<h1 class="text-2xl font-bold">Authenticating...</h1>
	<p class="mt-4">Please wait while we securely log you in.</p>
    {#if !data.token}
        <p class="mt-4 text-red-500">
            Login failed. Please try again. You will be redirected shortly.
        </p>
        <meta http-equiv="refresh" content="5;url=/auth/error?message=Login process failed unexpectedly." />
    {/if}
</div>
