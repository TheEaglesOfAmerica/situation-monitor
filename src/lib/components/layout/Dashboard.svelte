<script lang="ts">
	import type { Snippet } from 'svelte';
	import { settings } from '$lib/stores';

	interface Props {
		children: Snippet;
		editMode?: boolean;
		compactMode?: boolean;
	}

	let { children, editMode = false, compactMode = false }: Props = $props();

	// Drag state
	let draggedPanelId: string | null = $state(null);
	let dragOverPanelId: string | null = $state(null);

	function handleDragStart(e: DragEvent) {
		if (!editMode) {
			e.preventDefault();
			return;
		}
		const target = (e.target as HTMLElement).closest('[data-panel-id]') as HTMLElement;
		if (!target) {
			e.preventDefault();
			return;
		}
		
		const panelId = target.dataset.panelId;
		if (panelId) {
			draggedPanelId = panelId;
			if (e.dataTransfer) {
				e.dataTransfer.setData('text/plain', panelId);
				e.dataTransfer.effectAllowed = 'move';
			}
			target.classList.add('dragging');
			console.log('Drag started:', panelId);
		}
	}

	function handleDragEnd(e: DragEvent) {
		const target = (e.target as HTMLElement).closest('[data-panel-id]') as HTMLElement;
		if (target) {
			target.classList.remove('dragging');
		}
		draggedPanelId = null;
		dragOverPanelId = null;
	}

	function handleDragOver(e: DragEvent) {
		if (!editMode || !draggedPanelId) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		
		const target = (e.target as HTMLElement).closest('[data-panel-id]') as HTMLElement;
		if (target && target.dataset.panelId !== draggedPanelId) {
			const newDragOverId = target.dataset.panelId || null;
			if (newDragOverId !== dragOverPanelId) {
				// Remove previous drag-over class
				if (dragOverPanelId) {
					const prevTarget = document.querySelector(`[data-panel-id="${dragOverPanelId}"]`);
					prevTarget?.classList.remove('drag-over');
				}
				// Add new drag-over class
				dragOverPanelId = newDragOverId;
				if (dragOverPanelId) {
					target.classList.add('drag-over');
				}
			}
		}
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		const target = (e.target as HTMLElement).closest('[data-panel-id]') as HTMLElement;
		if (target && target.dataset.panelId === dragOverPanelId) {
			target.classList.remove('drag-over');
			dragOverPanelId = null;
		}
	}

	function handleDrop(e: DragEvent) {
		if (!editMode) return;
		e.preventDefault();
		e.stopPropagation();
		
		const target = (e.target as HTMLElement).closest('[data-panel-id]') as HTMLElement;
		if (!target || !draggedPanelId) return;
		
		// Clean up drag-over class
		if (dragOverPanelId) {
			const dragOverTarget = document.querySelector(`[data-panel-id="${dragOverPanelId}"]`);
			dragOverTarget?.classList.remove('drag-over');
		}
		
		const targetPanelId = target.dataset.panelId;
		if (targetPanelId && targetPanelId !== draggedPanelId) {
			// Get current order and swap positions
			const order = [...$settings.order];
			const fromIndex = order.indexOf(draggedPanelId as typeof order[number]);
			const toIndex = order.indexOf(targetPanelId as typeof order[number]);
			
			if (fromIndex !== -1 && toIndex !== -1) {
				order.splice(fromIndex, 1);
				order.splice(toIndex, 0, draggedPanelId as typeof order[number]);
				settings.updateOrder(order);
				console.log('Panel reordered:', draggedPanelId, '->', targetPanelId);
			}
		}
		
		draggedPanelId = null;
		dragOverPanelId = null;
	}
</script>

<main class="dashboard" class:edit-mode={editMode} class:compact={compactMode}>
	{#if editMode}
		<div class="edit-banner">
			<span>📝 Drag panels to rearrange • Press E or click Done when finished</span>
		</div>
	{/if}
	<div 
		class="dashboard-grid"
		ondragstart={handleDragStart}
		ondragend={handleDragEnd}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
	>
		{@render children()}
	</div>
</main>

<style>
	.dashboard {
		flex: 1;
		padding: 0.5rem;
		overflow-y: auto;
	}

	.dashboard.compact {
		padding: 0.25rem;
	}

	.dashboard.compact .dashboard-grid {
		column-gap: 0.25rem;
	}

	.dashboard.compact .dashboard-grid > :global(*) {
		margin-bottom: 0.25rem;
	}

	.edit-mode {
		background: repeating-linear-gradient(
			45deg,
			transparent,
			transparent 10px,
			rgba(var(--accent-rgb), 0.03) 10px,
			rgba(var(--accent-rgb), 0.03) 20px
		);
	}

	.edit-banner {
		background: var(--accent);
		color: var(--bg);
		padding: 0.5rem 1rem;
		text-align: center;
		font-size: 0.75rem;
		font-weight: 600;
		border-radius: 4px;
		margin-bottom: 0.5rem;
	}

	.dashboard-grid {
		column-count: 1;
		column-gap: 0.5rem;
		max-width: 2000px;
		margin: 0 auto;
	}

	.dashboard-grid > :global(*) {
		break-inside: avoid;
		margin-bottom: 0.5rem;
	}

	.dashboard-grid > :global(.dragging) {
		opacity: 0.5;
		transform: scale(0.98);
	}

	.dashboard-grid > :global(.drag-over) {
		border: 2px dashed var(--accent) !important;
	}

	:global([data-panel-id]) {
		transition: transform 0.15s ease, opacity 0.15s ease;
	}

	.edit-mode :global([data-panel-id]) {
		cursor: grab;
		user-select: none;
		-webkit-user-select: none;
	}

	.edit-mode :global([data-panel-id]:active) {
		cursor: grabbing;
	}

	.edit-mode :global([data-panel-id]:hover) {
		box-shadow: 0 0 0 2px var(--accent);
	}

	@media (min-width: 600px) {
		.dashboard-grid {
			column-count: 2;
		}
	}

	@media (min-width: 900px) {
		.dashboard-grid {
			column-count: 3;
		}
	}

	@media (min-width: 1200px) {
		.dashboard-grid {
			column-count: 4;
		}
	}

	@media (min-width: 1600px) {
		.dashboard-grid {
			column-count: 5;
		}
	}

	@media (min-width: 2000px) {
		.dashboard-grid {
			column-count: 6;
		}
	}
</style>
