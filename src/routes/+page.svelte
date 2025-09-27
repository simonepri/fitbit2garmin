<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import { ArrowRightOutline } from 'flowbite-svelte-icons';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';

	function redirectToDownloadPage() {
		goto(`${base}/download`);
	}
</script>

<div class="flex min-h-screen flex-col items-center justify-center text-center">
	<h1 class="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4">
		Fitbit to Garmin Data Exporter
	</h1>
	<p class="text-lg text-gray-500 dark:text-gray-400 mb-8">
		Download your Fitbit data and convert it to a Garmin-compatible format.
	</p>
	<Button size="xl" onclick={redirectToDownloadPage}>
		Download your data
		<ArrowRightOutline class="w-6 h-6 ml-2" />
	</Button>
</div>
