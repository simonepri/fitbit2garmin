<script lang="ts">
	import { toast } from '$lib/stores/toast';

    const typeClasses = {
        info: 'bg-blue-500',
        success: 'bg-green-500',
        error: 'bg-red-500',
    }
</script>

<div class="fixed bottom-0 right-0 p-4 space-y-2 w-full max-w-xs">
	{#each $toast as { id, message, type } (id)}
		<div
			class="relative text-white py-3 px-4 rounded-lg shadow-lg flex justify-between items-center {typeClasses[type]}"
		>
			<span>{message}</span>
			<button on:click={() => toast.dismiss(id)} class="ml-4 text-xl font-bold">&times;</button>
		</div>
	{/each}
</div>
