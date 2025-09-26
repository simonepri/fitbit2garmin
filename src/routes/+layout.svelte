<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { FitbitAPI } from '$lib/fitbit-api';
	import { TaskQueue } from '$lib/queue';
	import { PUBLIC_FITBIT_CLIENT_ID, PUBLIC_FITBIT_REDIRECT_URI } from '$env/static/public';
	import { Toaster } from 'svelte-french-toast';
	import { setContext } from 'svelte';

	// Initialize API and Queue
	const fitbitApi = new FitbitAPI(PUBLIC_FITBIT_CLIENT_ID, PUBLIC_FITBIT_REDIRECT_URI);
	const queue = new TaskQueue(fitbitApi);

	// Make API and Queue available to all child components
	setContext('fitbitApi', fitbitApi);
	setContext('queue', queue);

	const { state: fitbitState } = fitbitApi;

	onMount(() => {
		// Load persisted state from localStorage
		const storedState = localStorage.getItem('fitbitApiState');
		if (storedState) {
			fitbitApi.fromJSON(storedState);
			if ($fitbitState.userId) {
				queue.init($fitbitState.userId);
			}
		}

		// Subscribe to state changes and persist them
		fitbitApi.state.subscribe((state) => {
			localStorage.setItem('fitbitApiState', JSON.stringify(state));
		});
	});
</script>

<Toaster />
<main class="p-4 container mx-auto">
	<slot />
</main>
