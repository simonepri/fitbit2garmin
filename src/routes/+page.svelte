<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import { ArrowDownToBracketOutline } from 'flowbite-svelte-icons';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { fitbitApi } from '$lib/stores';

	const { isLoggedIn } = fitbitApi;

	const CODE_VERIFIER_KEY = 'fitbit_code_verifier';

	async function startDownload() {
		if (!browser) return;

		if ($isLoggedIn) {
			goto('/download');
		} else {
			const { url, codeVerifier } = await fitbitApi.getAuthorizationUrl();
			// Store the code verifier so we can use it on the callback page
			sessionStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);
			window.location.href = url;
		}
	}
</script>

<div class="flex flex-col items-center justify-center pt-20">
	<h1 class="text-4xl font-bold mb-8 text-center">Fitbit to Garmin Data Exporter</h1>
	<p class="text-lg text-gray-600 dark:text-gray-400 mb-12 text-center max-w-2xl">
		Securely download your Fitbit weight, activity, and TCX data for a specific date range, and get
		it as a Garmin-compatible ZIP file. All processing happens right in your browser.
	</p>
	<Button size="xl" onclick={startDownload}>
		<ArrowDownToBracketOutline class="w-6 h-6 mr-2" />
		Download Your Data
	</Button>
</div>