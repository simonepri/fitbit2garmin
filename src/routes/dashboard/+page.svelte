<script lang="ts">
    import DownloadTasksForm from '$lib/components/DownloadTasksForm.svelte';
    import DownloadsTable from '$lib/components/DownloadsTable.svelte';
    import DownloadStats from '$lib/components/DownloadStats.svelte';
    import { downloads, stats } from '$lib/stores/downloads';
    import { onMount } from 'svelte';

    let saveAs: (blob: Blob, filename: string) => void;

    onMount(async () => {
        const fileSaver = await import('file-saver');
        saveAs = fileSaver.saveAs;
    });

    async function handleDownloadClick() {
        const blob = await downloads.downloadAllCompleted();
        if (blob && saveAs) {
            saveAs(blob, 'fitbit_export.zip');
        }
    }
</script>

<div class="space-y-8">
    <DownloadTasksForm />

<div class="space-y-4">
    <DownloadStats />
    <div class="flex justify-end flex-wrap gap-4">
        {#if $stats.total > 0}
            <button on:click={() => {if(confirm('Are you sure you want to delete all tasks and downloaded data? This cannot be undone.')) downloads.clearAll()}} class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded cursor-pointer">
                Delete All Data
            </button>
            {/if}
            {#if $stats.failed > 0}
            <button on:click={() => downloads.retryAllFailedTasks()} class="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded cursor-pointer">
                Retry Failed
            </button>
            {/if}
            {#if $stats.completed > 0}
            <button on:click={handleDownloadClick} class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded cursor-pointer">
                Download Completed
            </button>
            {/if}
        </div>
    </div>

    <DownloadsTable />
</div>
