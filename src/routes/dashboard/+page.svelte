<script lang="ts">
    import DownloadTasksForm from '$lib/components/DownloadTasksForm.svelte';
    import DownloadsTable from '$lib/components/DownloadsTable.svelte';
    import { downloads } from '$lib/stores/downloads';
    import JSZip from 'jszip';
    import { saveAs } from 'file-saver'; // This dependency is missing! I'll need to install it.

    import { toast } from '$lib/stores/toast';

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
                    const path = `${file.type}/${task.year}-${task.month.toString().padStart(2, '0')}/${file.id.replace(':', '_')}.${extension}`;
                    zip.file(path, file.content);
                }
            }

            const content = await zip.generateAsync({ type: 'blob' });
            saveAs(content, 'fitbit_export.zip');
            toast.success('Download started!');
        } catch (e: any) {
            console.error('Failed to create zip file', e);
            toast.error(`Failed to create zip: ${e.message}`);
        }
    }
</script>

<div class="space-y-8">
    <DownloadTasksForm />

    <div class="flex justify-end">
        <button on:click={downloadAll} class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded">
            Download All Completed as .zip
        </button>
    </div>

    <DownloadsTable />
</div>
