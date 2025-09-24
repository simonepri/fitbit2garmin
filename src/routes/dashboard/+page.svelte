<script lang="ts">
    import DownloadTasksForm from '$lib/components/DownloadTasksForm.svelte';
    import DownloadsTable from '$lib/components/DownloadsTable.svelte';
    import QueueStatusDisplay from '$lib/components/QueueStatusDisplay.svelte';
    import { downloads, stats } from '$lib/stores/downloads';
    import JSZip from 'jszip';
    import { toast } from '$lib/stores/toast';
    import { onMount } from 'svelte';

    let saveAs: (blob: Blob, filename: string) => void;

    onMount(async () => {
        // Dynamically import file-saver only on the client to prevent SSR issues
        const fileSaver = await import('file-saver');
        saveAs = fileSaver.default.saveAs || fileSaver.saveAs; // Handle CJS/ESM interop
    });

    async function downloadAll() {
        try {
            toast.info('Preparing zip file...');
            const zip = new JSZip();
            const tasksToDownload = $downloads.filter(t => t.status === 'completed' && t.completedFiles > 0);

            if (tasksToDownload.length === 0) {
                toast.error('No completed tasks with files to download.');
                return;
            }

            for (const task of tasksToDownload) {
                const files = await downloads.getFilesForTask(task.id);
                for (const file of files) {
                    const extension = file.type === 'tcx' ? 'tcx' : 'csv';
                    const path = `${task.year}-${String(task.month).padStart(2, '0')}/${file.id.replace(':', '_')}.${extension}`;
                    zip.file(path, file.content);
                }
            }

            const content = await zip.generateAsync({ type: 'blob' });
            if (saveAs) {
                saveAs(content, 'fitbit_export.zip');
                toast.success('Download started!');
            } else {
                toast.error('File saver not ready, please wait a moment and try again.');
            }
        } catch (e: any) {
            console.error('Failed to create zip file', e);
            toast.error(`Failed to create zip: ${e.message}`);
        }
    }
</script>

<div class="space-y-8">
    <DownloadTasksForm />

<div class="space-y-4">
    <QueueStatusDisplay />
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
            <button on:click={downloadAll} class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded cursor-pointer">
                Download Completed
            </button>
            {/if}
        </div>
    </div>

    <DownloadsTable />
</div>
