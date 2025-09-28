<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { Navbar, NavBrand, NavLi, NavContainer, NavHamburger } from 'flowbite-svelte';
	import { page } from '$app/stores';

	onMount(() => {
		if (document.body.classList.contains('dark')) return;
		document.body.classList.add('dark');
	});
</script>

<Navbar class="px-4">
	<NavBrand href="/">
		<span class="text-xl font-semibold dark:text-white self-center whitespace-nowrap">
			Fitbit2Garmin
		</span>
	</NavBrand>
	<NavHamburger />
	<NavContainer>
		<NavLi href="/">Home</NavLi>
		{#if $page.url.pathname.startsWith('/download')}
			<NavLi href="/download">Dashboard</NavLi>
		{/if}
	</NavContainer>
</Navbar>

<main class="dark:bg-gray-900 dark:text-white p-4 min-h-screen">
	<slot />
</main>
