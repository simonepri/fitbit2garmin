<script lang="ts">
	import { auth } from '$lib/stores/auth';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';

	function handleLogout() {
		auth.logout();
        goto('/');
	}
</script>

<header class="bg-gray-800 text-white p-4 flex justify-between items-center">
	<h1 class="text-xl font-bold">
        <a href="/">Fitbit to Garmin</a>
    </h1>
	{#if $auth}
		<div class="flex items-center">
            <span class="mr-4">Welcome, {$auth.user_id}</span>
			<button
				on:click={handleLogout}
				class="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
			>
				Logout
			</button>
		</div>
	{/if}
</header>
