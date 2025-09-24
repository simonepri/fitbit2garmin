<script lang="ts">
    import '../app.css';
    import Header from '$lib/components/Header.svelte';
    import Toast from '$lib/components/Toast.svelte';
    import { auth } from '$lib/stores/auth';
    import { downloads } from '$lib/stores/downloads';
    import { onMount } from 'svelte';

    onMount(() => {
        // Initialize stores that need to load from browser storage
        // The auth store loads itself, but downloads needs a kick
        if ($auth) {
            downloads.initialize();
        }
    });
</script>

<div class="min-h-screen bg-gray-100">
    <Header />
    <main class="p-4 sm:p-6 lg:p-8">
        <slot />
    </main>
    <Toast />
</div>
