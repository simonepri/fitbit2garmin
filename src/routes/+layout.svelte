<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Fitbit to Garmin</title>
</svelte:head>

{@render children?.()}
