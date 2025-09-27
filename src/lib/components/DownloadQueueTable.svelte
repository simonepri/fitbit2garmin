<script lang="ts">
	import {
		Table,
		TableBody,
		TableBodyCell,
		TableBodyRow,
		TableHead,
		TableHeadCell,
		Button,
		Badge,
		Progressbar
	} from 'flowbite-svelte';
	import { RefreshOutline } from 'flowbite-svelte-icons';
	import type { DownloadQueue } from '$lib/queue';
	import { TaskStatus } from '$lib/tasks';

	let { queue }: { queue: DownloadQueue } = $props();
	const tasks = queue.tasks;

	function getStatusColor(status: TaskStatus) {
		switch (status) {
			case TaskStatus.Completed:
				return 'green';
			case TaskStatus.Downloading:
				return 'blue';
			case TaskStatus.Failed:
				return 'red';
			case TaskStatus.Pending:
			default:
				return 'gray';
		}
	}

	function formatDuration(ms: number) {
		if (ms < 1000) return `${Math.round(ms)}ms`;
		const seconds = (ms / 1000).toFixed(2);
		return `${seconds}s`;
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
				<TableHeadCell><span class="sr-only">Actions</span></TableHeadCell>
			</TableHead>
			<TableBody class="divide-y">
				{#each $tasks as task (task.id)}
					{@const progress = task.getProgress()}
					<TableBodyRow>
						<TableBodyCell class="capitalize">{task.state.type}</TableBodyCell>
						<TableBodyCell
							>{task.state.year}-{String(task.state.month).padStart(2, '0')}</TableBodyCell
						>
						<TableBodyCell>
							<Badge color={getStatusColor(task.status)} class="capitalize">{task.status}</Badge>
						</TableBodyCell>
						<TableBodyCell>
							{#if progress.total > 1}
								<div class="w-32">
									<Progressbar
										progress={progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}
									/>
									<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
										{progress.completed}/{progress.total}
										{#if progress.failed > 0}
											<span class="text-red-500">({progress.failed} failed)</span>
										{/if}
										{#if progress.empty > 0}
											<span>({progress.empty} empty)</span>
										{/if}
									</div>
								</div>
							{:else if task.status === 'completed' && progress.empty > 0}
								<Badge color="yellow">Empty</Badge>
							{/if}
						</TableBodyCell>
						<TableBodyCell>{formatDuration(task.state.runtime)}</TableBodyCell>
						<TableBodyCell>
							{#if task.status === TaskStatus.Failed || task.status === TaskStatus.Completed}
								<Button size="xs" color="alternative" onclick={() => queue.retryTask(task.id)}>
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
