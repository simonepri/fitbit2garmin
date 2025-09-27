<script lang="ts">
	import { Navbar, NavBrand, NavLi, NavUl, Toast } from 'flowbite-svelte';
	import '../app.css';
	import { browser } from '$app/environment';
</script>

<header class="bg-white dark:bg-gray-900 sticky top-0 z-50 shadow-md">
	<Navbar class="px-4">
		<NavBrand href="/">
			<span class="self-center whitespace-nowrap text-xl font-semibold dark:text-white">
				Fitbit to Garmin
			</span>
		</NavBrand>
		<NavUl class="md:order-1">
			<NavLi href="/">Home</NavLi>
			<NavLi href="/download">Download</NavLi>
		</NavUl>
	</Navbar>
</header>

<main class="container mx-auto p-4">
	<slot />
</main>

{#if browser}
	<Toast />
{/if}