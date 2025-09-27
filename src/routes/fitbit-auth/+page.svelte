<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getOAuth2Token } from '$lib/fitbit-api';
	import { Spinner } from 'flowbite-svelte';
	import { toast } from 'flowbite-svelte';

	onMount(async () => {
		const code = $page.url.searchParams.get('code');
		const state = $page.url.searchParams.get('state');

		if (code && state) {
			try {
				await getOAuth2Token(code, state);
				toast.success('Successfully authenticated with Fitbit!');
				goto('/download');
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				toast.danger(`Authentication failed: ${message}`);
				goto('/');
			}
		} else {
			toast.danger('Invalid authentication callback.');
			goto('/');
		}
	});
</script>

<div class="flex h-[calc(100vh-200px)] flex-col items-center justify-center">
	<Spinner size={12} />
	<p class="mt-4 text-lg text-gray-600 dark:text-gray-300">Authenticating with Fitbit...</p>
</div>
