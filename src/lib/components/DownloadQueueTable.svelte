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
	import type { Task } from '$lib/tasks';
	import type { TaskQueue } from '$lib/queue';

	export let tasks: Task[];
	export let queue: TaskQueue;

	function formatRuntime(ms: number): string {
		return `${(ms / 1000).toFixed(2)}s`;
	}
</script>

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
			{#if tasks.length === 0}
				<TableBodyRow>
					<TableBodyCell colspan={6} class="text-center">The queue is empty.</TableBodyCell>
				</TableBodyRow>
			{:else}
				{#each tasks as task (task.id)}
					<TableBodyRow>
						<TableBodyCell class="capitalize">{task.type}</TableBodyCell>
						<TableBodyCell>{task.year}-{String(task.month).padStart(2, '0')}</TableBodyCell>
						<TableBodyCell class="capitalize">{task.status}</TableBodyCell>
						<TableBodyCell>
							{#if task.totalFiles > 0}
								<div class="w-48">
									<Progressbar
										progress={((task.completedFiles / task.totalFiles) * 100).toFixed(0)}
									/>
									<div class="text-xs mt-1">
										{task.completedFiles}/{task.totalFiles}
										({task.failedFiles} failed, {task.emptyFiles} empty)
									</div>
								</div>
							{:else}
								N/A
							{/if}
						</TableBodyCell>
						<TableBodyCell>{formatRuntime(task.runtime)}</TableBodyCell>
						<TableBodyCell>
							<Button
								size="sm"
								onclick={() => queue.retryTask(task.id)}
								disabled={task.status !== 'failed' && task.status !== 'completed'}
							>
								Retry
							</Button>
						</TableBodyCell>
					</TableBodyRow>
				{/each}
			{/if}
		</TableBody>
	</Table>
</div>
