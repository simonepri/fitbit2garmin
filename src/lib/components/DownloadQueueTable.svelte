<script lang="ts">
	import {
		Table,
		TableHead,
		TableBody,
		TableHeadCell,
		TableBodyRow,
		TableBodyCell,
		Button
	} from 'flowbite-svelte';
	import type { Task } from '$lib/tasks';

	export let tasks: Task[];
	export let onRetry: (taskId: string) => void;

	function formatRuntime(ms: number) {
		return (ms / 1000).toFixed(2) + 's';
	}

	function getProgress(task: Task) {
		const total = task.files.length;
		if (total === 0 && (task.status === 'pending' || task.status === 'downloading')) return '...';
		if (total === 0) return 'N/A';

		const completed = task.files.filter((f) => f.status === 'completed').length;
		const failed = task.files.filter((f) => f.status === 'failed').length;
		const empty = task.files.filter((f) => f.status === 'empty').length;

		let progressStr = `${completed}/${total}`;
		if (failed > 0) progressStr += ` (${failed} failed)`;
		if (empty > 0) progressStr += ` (${empty} empty)`;
		return progressStr;
	}
</script>

<Table>
	<TableHead>
		<TableHeadCell>Data Type</TableHeadCell>
		<TableHeadCell>Date</TableHeadCell>
		<TableHeadCell>Status</TableHeadCell>
		<TableHeadCell>Progress</TableHeadCell>
		<TableHeadCell>Runtime</TableHeadCell>
		<TableHeadCell>Actions</TableHeadCell>
	</TableHead>
	<TableBody>
		{#each tasks as task (task.id)}
			<TableBodyRow>
				<TableBodyCell>{task.type.toUpperCase()}</TableBodyCell>
				<TableBodyCell>{task.date.year}-{String(task.date.month).padStart(2, '0')}</TableBodyCell>
				<TableBodyCell>{task.status}</TableBodyCell>
				<TableBodyCell>{getProgress(task)}</TableBodyCell>
				<TableBodyCell>{formatRuntime(task.runtime)}</TableBodyCell>
				<TableBodyCell>
					<Button
						size="sm"
						onclick={() => onRetry(task.id)}
						disabled={task.status !== 'failed' && task.status !== 'completed'}
					>
						Retry
					</Button>
				</TableBodyCell>
			</TableBodyRow>
		{/each}
	</TableBody>
</Table>
