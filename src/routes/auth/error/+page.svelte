<script lang="ts">
    import { page } from '$app/stores';
    import LoginButton from '$lib/components/LoginButton.svelte';

    const errorMessage = $page.url.searchParams.get('message') || 'An unknown error occurred.';
</script>

<div class="text-center mt-20">
    <h1 class="text-4xl font-bold text-red-600">Authentication Failed</h1>
    <p class="mt-6 text-lg leading-8 text-gray-600">
        There was a problem logging you in.
    </p>
    <p class="mt-2 text-md text-gray-500 bg-red-100 p-4 rounded-md inline-block">
        <strong>Error:</strong> {errorMessage}
    </p>
    <div class="mt-10">
        <p class="mb-4">Please try again.</p>
        <LoginButton />
    </div>
</div>
