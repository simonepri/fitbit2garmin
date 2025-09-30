<script lang="ts">
	import { Navbar, NavBrand, Button, DarkMode } from 'flowbite-svelte';
	import { ArrowRightToBracketOutline } from 'flowbite-svelte-icons';
	import { fitbitApi } from '$lib/stores';
	import { goto } from '$app/navigation';

	const { isLoggedIn, userId, logout } = fitbitApi;

	function handleLogout() {
		logout();
		goto('/');
	}
</script>

<Navbar>
	<NavBrand href="/">
		<span class="self-center whitespace-nowrap text-xl font-semibold dark:text-white">
			fitbit2garmin
		</span>
	</NavBrand>
	<div class="flex md:order-2 items-center">
		{#if $isLoggedIn && $userId}
			<Button onclick={handleLogout} size="sm" class="mr-2">
				<ArrowRightToBracketOutline class="w-5 h-5 mr-2" />
				Logout, {$userId}
			</Button>
		{/if}
		<DarkMode />
	</div>
</Navbar>