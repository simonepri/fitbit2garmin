<script lang="ts">
    import type { DownloadTask } from '$lib/types';
    import { formatDuration } from '$lib/utils';
</script>

<span>{formatDuration(task.activeTime)}</span>