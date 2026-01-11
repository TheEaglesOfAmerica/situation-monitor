<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		compactMode?: boolean;
	}

	let { children, compactMode = false }: Props = $props();
</script>

<div class="dashboard" class:compact={compactMode}>
	<div class="dashboard-grid">
		{@render children()}
	</div>
</div>

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

	/* Panel container transitions */
	:global([data-panel-id]) {
		transition: opacity 0.2s ease, transform 0.2s ease;
	}

	/* Smooth panel appearance */
	@keyframes panelFadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	:global([data-panel-id]) {
		animation: panelFadeIn 0.3s ease-out backwards;
	}

	/* Stagger animation for each panel */
	:global([data-panel-id]:nth-child(1)) { animation-delay: 0.05s; }
	:global([data-panel-id]:nth-child(2)) { animation-delay: 0.1s; }
	:global([data-panel-id]:nth-child(3)) { animation-delay: 0.15s; }
	:global([data-panel-id]:nth-child(4)) { animation-delay: 0.2s; }
	:global([data-panel-id]:nth-child(5)) { animation-delay: 0.25s; }
	:global([data-panel-id]:nth-child(6)) { animation-delay: 0.3s; }
	:global([data-panel-id]:nth-child(n+7)) { animation-delay: 0.35s; }

	/* Responsive column layout */
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
