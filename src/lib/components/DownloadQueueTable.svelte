<script lang="ts">
	import {
		Table,
		TableBody,
		TableBodyCell,
		TableBodyRow,
		TableHead,
		TableHeadCell,
		Badge,
		Progressbar,
		Button
	} from 'flowbite-svelte';
	import { RefreshOutline } from 'flowbite-svelte-icons';
	import { queueManager } from '$lib/stores';
	import type { DownloadTask, TaskStatus } from '$lib/tasks';

	const { tasks$, retryTask } = queueManager;

	function getStatusColor(status: TaskStatus) {
		switch (status) {
			case 'completed':
				return 'green';
			case 'running':
				return 'blue';
			case 'failed':
				return 'red';
			case 'pending':
			default:
				return 'dark';
		}
	}

	function formatDuration(ms: number): string {
		if (ms === 0) return '-';
		if (ms < 1000) return `<1s`;
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}m ${seconds}s`;
	}

	function getProgressValue(task: DownloadTask): number {
		if (task.progress.total === 0) {
			return task.status === 'completed' ? 100 : 0;
		}
		return (task.progress.completed / task.progress.total) * 100;
	}
</script>

{#if $tasks$.length > 0}
	<div class="overflow-x-auto">
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
				{#each $tasks$ as task (task.id)}
					<TableBodyRow>
						<TableBodyCell class="capitalize">{task.type}</TableBodyCell>
						<TableBodyCell>{task.date}</TableBodyCell>
						<TableBodyCell>
							<Badge color={getStatusColor(task.status)} class="capitalize">
								{task.status}
							</Badge>
						</TableBodyCell>
						<TableBodyCell>
							{#if task.status === 'running' || task.progress.total > 1}
								<div class="w-48">
									<Progressbar progress={getProgressValue(task)} />
									<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
										{task.progress.completed}/{task.progress.total}
										{#if task.progress.failed > 0}
											<span class="text-red-500">({task.progress.failed} failed)</span>
										{/if}
										{#if task.progress.empty > 0}
											<span class="text-yellow-500">({task.progress.empty} empty)</span>
										{/if}
									</div>
								</div>
							{:else if task.status === 'completed'}
								<Badge color="green">
									{task.progress.empty ? 'No data' : 'Complete'}
								</Badge>
							{:else if task.status === 'failed'}
								<Badge color="red" title={task.error || ''}>Error</Badge>
							{:else}
								-
							{/if}
						</TableBodyCell>
						<TableBodyCell>{formatDuration(task.runtime)}</TableBodyCell>
						<TableBodyCell>
							{#if task.status === 'completed' || task.status === 'failed'}
								<Button
									onclick={() => retryTask(task.id)}
									size="xs"
									class="!p-2"
									title="Retry Task"
								>
									<RefreshOutline class="w-4 h-4" />
								</Button>
							{/if}
						</TableBodyCell>
					</TableBodyRow>
				{/each}
			</TableBody>
		</Table>
	</div>
{/if}