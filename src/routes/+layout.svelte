<script lang="ts">
	import '../app.css';
	import { onMount, setContext } from 'svelte';
	import { Navbar, NavBrand, Button, Modal } from 'flowbite-svelte';
	import { FitbitApi } from '$lib/fitbit-api';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { keys } from '$lib/keys';

	const fitbitApi = new FitbitApi();
	setContext(keys.fitbitApi, fitbitApi);

	let userId: string | undefined;
	let showLogoutModal = false;

	fitbitApi.authState.subscribe((state) => {
		userId = state.userId;
	});

	onMount(() => {
		if (document.documentElement.classList.contains('dark')) return;
		document.documentElement.classList.add('dark');
	});

	function handleLogout() {
		fitbitApi.logout();
		goto(resolve('/'));
	}
</script>

<Navbar class="px-4">
	<NavBrand href="/">
		<span class="self-center whitespace-nowrap text-xl font-semibold dark:text-white">
			Fitbit2Garmin
		</span>
	</NavBrand>
	<div class="ml-auto flex items-center space-x-3 md:order-2 rtl:space-x-reverse">
		{#if userId}
			<span class="mr-3 hidden text-sm text-gray-500 dark:text-gray-400 sm:inline">
				Welcome, {userId}
			</span>
			<Button size="sm" onclick={() => (showLogoutModal = true)}>Logout</Button>
		{/if}
	</div>
</Navbar>

<main class="min-h-screen bg-white p-4 dark:bg-gray-900 dark:text-white">
	<slot />
</main>

<Modal bind:open={showLogoutModal} title="Confirm Logout" autoclose>
	<p>Are you sure you want to log out? All your queued and downloaded data will be erased.</p>
	<div class="mt-4 flex justify-end gap-2">
		<Button color="red" onclick={handleLogout}>Logout</Button>
		<Button color="gray" onclick={() => (showLogoutModal = false)}>Cancel</Button>
	</div>
</Modal>