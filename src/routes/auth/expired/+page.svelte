<script lang="ts">
    import LoginButton from '$lib/components/LoginButton.svelte';
</script>

<div class="text-center mt-20">
    <h1 class="text-4xl font-bold text-orange-600">Session Expired</h1>
    <p class="mt-6 text-lg leading-8 text-gray-600">
        Your session has expired. For your security, you have been logged out.
    </p>
    <div class="mt-10">
        <p class="mb-4">Please log in again to continue.</p>
        <LoginButton />
    </div>
</div>
