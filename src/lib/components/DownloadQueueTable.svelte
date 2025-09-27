<script lang="ts">
	import {
		Table,
		TableBody,
		TableBodyCell,
		TableBodyRow,
		TableHead,
		TableHeadCell,
		Button,
		Progressbar
	} from 'flowbite-svelte';
	import { downloadQueue } from '$lib/queue';
	import { derived, get } from 'svelte/store';
	import { humanizeDuration } from '$lib/utils';
	import type { Task } from '$lib/tasks';

	const tasks = derived(downloadQueue, ($q) => ($q ? get($q.tasks) : []));

	function handleRetry(taskId: string) {
		const q = get(downloadQueue);
		if (q) {
			q.retryTask(taskId);
		}
	}

	function formatProgress(task: Task) {
		let progressText = `${task.progress.completed}/${task.progress.total}`;
		const extras = [];
		if (task.progress.failed > 0) {
			extras.push(`${task.progress.failed} failed`);
		}
		if (task.progress.empty > 0) {
			extras.push(`${task.progress.empty} empty`);
		}
		if (extras.length > 0) {
			progressText += ` (${extras.join(', ')})`;
		}
		return progressText;
	}
</script>

{#if $tasks.length > 0}
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
				{#each $tasks as task (task.id)}
					<TableBodyRow>
						<TableBodyCell>{task.type.toUpperCase()}</TableBodyCell>
						<TableBodyCell>{task.year}-{String(task.month).padStart(2, '0')}</TableBodyCell>
						<TableBodyCell>
							<span
								class="px-2 py-1 text-xs font-semibold leading-tight rounded-full"
								class:bg-green-100={task.status === 'completed'}
								class:text-green-700={task.status === 'completed'}
								class:dark:bg-green-700={task.status === 'completed'}
								class:dark:text-green-100={task.status === 'completed'}
								class:bg-yellow-100={task.status === 'downloading'}
								class:text-yellow-700={task.status === 'downloading'}
								class:dark:bg-yellow-700={task.status === 'downloading'}
								class:dark:text-yellow-100={task.status === 'downloading'}
								class:bg-red-100={task.status === 'failed'}
								class:text-red-700={task.status === 'failed'}
								class:dark:bg-red-700={task.status === 'failed'}
								class:dark:text-red-100={task.status === 'failed'}
								class:bg-gray-100={task.status === 'pending'}
								class:text-gray-700={task.status === 'pending'}
								class:dark:bg-gray-700={task.status === 'pending'}
								class:dark:text-gray-100={task.status === 'pending'}
							>
								{task.status}
							</span>
						</TableBodyCell>
						<TableBodyCell>
							{#if task.progress.total > 0}
								<Progressbar
									progress={task.progress.completed}
									total={task.progress.total}
									labelInside
								>
									{formatProgress(task)}
								</Progressbar>
							{:else}
								N/A
							{/if}
						</TableBodyCell>
						<TableBodyCell>{humanizeDuration(task.runtime)}</TableBodyCell>
						<TableBodyCell>
							<Button
								size="xs"
								onclick={() => handleRetry(task.id)}
								disabled={task.status === 'downloading' || task.status === 'pending'}
							>
								Retry
							</Button>
						</TableBodyCell>
					</TableBodyRow>
				{/each}
			</TableBody>
		</Table>
	</div>
{/if}
