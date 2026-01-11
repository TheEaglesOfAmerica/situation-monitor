<script lang="ts">
	import { Panel, NewsItem as NewsItemComponent } from '$lib/components/common';
	import type { NewsItem } from '$lib/types';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		news?: NewsItem[];
	}

	let { news = [] }: Props = $props();

	// Filter for breaking/recent news from reliable sources
	const realtimeNews = $derived(() => {
		const now = Date.now();
		const oneHourAgo = now - (60 * 60 * 1000);
		const twoHoursAgo = now - (2 * 60 * 60 * 1000);

		// Priority sources
		const prioritySources = new Set([
			'reuters',
			'associated press',
			'ap news',
			'bbc',
			'the guardian',
			'new york times',
			'washington post',
			'foreign policy',
			'the economist',
			'financial times',
			'wall street journal',
			'politico',
			'al jazeera',
			'bloomberg'
		]);

		return news
			.filter(item => {
				// Must be recent
				if (item.timestamp < twoHoursAgo) return false;

				// Check if from priority source
				const sourceLower = item.source.toLowerCase();
				const isPriority = Array.from(prioritySources).some(src => 
					sourceLower.includes(src)
				);

				// Include if priority source or has alert keyword
				return isPriority || item.isAlert;
			})
			.sort((a, b) => b.timestamp - a.timestamp)
			.slice(0, 15);
	});

	// Auto-refresh indicator
	let lastUpdate = $state(Date.now());
	let nextRefresh = $state(60); // seconds
	let refreshInterval: ReturnType<typeof setInterval> | null = null;

	// Breaking news notifications
	let previousBreakingIds = $state(new Set<string>());
	let newBreakingNews = $state<NewsItem[]>([]);
	let notificationTimeout: ReturnType<typeof setTimeout> | null = null;

	// Track new breaking news
	$effect(() => {
		const currentBreaking = realtimeNews().filter(isBreaking);
		const currentIds = new Set(currentBreaking.map(n => n.id));
		
		// Find truly new items
		const newItems = currentBreaking.filter(n => !previousBreakingIds.has(n.id));
		
		if (newItems.length > 0) {
			newBreakingNews = newItems;
			
			// Clear notification after 10 seconds
			if (notificationTimeout) clearTimeout(notificationTimeout);
			notificationTimeout = setTimeout(() => {
				newBreakingNews = [];
			}, 10000);
		}
		
		previousBreakingIds = currentIds;
	});

	onMount(() => {
		refreshInterval = setInterval(() => {
			nextRefresh--;
			if (nextRefresh <= 0) {
				lastUpdate = Date.now();
				nextRefresh = 60;
			}
		}, 1000);
	});

	onDestroy(() => {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
		if (notificationTimeout) {
			clearTimeout(notificationTimeout);
		}
	});

	const isBreaking = (item: NewsItem) => {
		const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
		return item.timestamp > fiveMinutesAgo;
	};

	const getTimeLabel = (timestamp: number) => {
		const seconds = Math.floor((Date.now() - timestamp) / 1000);
		if (seconds < 60) return 'Just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		return `${hours}h ago`;
	};
</script>

<Panel>
	<div class="realtime-panel">
		{#if newBreakingNews.length > 0}
			<div class="breaking-notification">
				<span class="notification-icon">🚨</span>
				<div class="notification-content">
					<strong>{newBreakingNews.length} NEW BREAKING {newBreakingNews.length === 1 ? 'STORY' : 'STORIES'}</strong>
					<div class="notification-preview">
						{newBreakingNews[0].title.slice(0, 80)}{newBreakingNews[0].title.length > 80 ? '...' : ''}
					</div>
				</div>
			</div>
		{/if}
		
		<div class="realtime-header">
			<h3 class="panel-title">
				<span class="live-indicator">🔴</span>
				Breaking News
			</h3>
			<div class="refresh-info">
				Next update: {nextRefresh}s
			</div>
		</div>

		<div class="news-list">
			{#if realtimeNews().length === 0}
				<div class="empty-state">
					<span>⏳</span>
					<p>Waiting for breaking news...</p>
					<small>Monitoring all sources</small>
				</div>
			{:else}
				{#each realtimeNews() as item (item.id)}
					<div class="news-item" class:breaking={isBreaking(item)}>
						{#if isBreaking(item)}
							<span class="breaking-badge">BREAKING</span>
						{/if}
						<NewsItemComponent {item} compact={true} />
						<div class="item-meta">
							<span class="source">{item.source}</span>
							<span class="time">{getTimeLabel(item.timestamp)}</span>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</Panel>

<style>
	.realtime-panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.breaking-notification {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem;
		background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05));
		border: 2px solid rgba(239, 68, 68, 0.5);
		border-radius: 8px;
		animation: slideIn 0.3s ease-out, pulse 2s ease-in-out infinite;
	}

	.notification-icon {
		font-size: 1.5rem;
		animation: shake 0.5s ease-in-out infinite;
	}

	.notification-content {
		flex: 1;
	}

	.notification-content strong {
		display: block;
		color: #ef4444;
		font-size: 0.875rem;
		font-weight: 700;
		margin-bottom: 0.25rem;
		letter-spacing: 0.5px;
	}

	.notification-preview {
		color: var(--text-secondary);
		font-size: 0.8125rem;
		line-height: 1.4;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes pulse {
		0%, 100% {
			box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
		}
		50% {
			box-shadow: 0 0 0 8px rgba(239, 68, 68, 0);
		}
	}

	@keyframes shake {
		0%, 100% { transform: rotate(0deg); }
		25% { transform: rotate(-10deg); }
		75% { transform: rotate(10deg); }
	}

	.realtime-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--border);
	}

	.panel-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.live-indicator {
		animation: pulse 2s ease-in-out infinite;
		font-size: 0.6rem;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}

	.refresh-info {
		font-size: 0.65rem;
		color: var(--text-muted);
		font-family: monospace;
	}

	.news-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		text-align: center;
		color: var(--text-muted);
	}

	.empty-state span {
		font-size: 2rem;
		margin-bottom: 0.5rem;
	}

	.empty-state p {
		margin: 0.5rem 0;
		font-weight: 600;
	}

	.empty-state small {
		font-size: 0.7rem;
	}

	.news-item {
		position: relative;
		padding: 0.75rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		transition: all 0.2s ease;
	}

	.news-item:hover {
		border-color: var(--accent);
		transform: translateX(2px);
	}

	.news-item.breaking {
		background: rgba(var(--accent-rgb), 0.05);
		border-color: var(--accent);
		box-shadow: 0 0 8px rgba(var(--accent-rgb), 0.2);
	}

	.breaking-badge {
		position: absolute;
		top: -0.5rem;
		right: 0.5rem;
		background: var(--accent);
		color: var(--bg);
		padding: 0.15rem 0.5rem;
		font-size: 0.6rem;
		font-weight: 700;
		border-radius: 3px;
		letter-spacing: 0.05em;
		animation: slideIn 0.3s ease-out;
	}

	@keyframes slideIn {
		from {
			transform: translateY(-10px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.item-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--border);
		font-size: 0.65rem;
		color: var(--text-muted);
	}

	.source {
		font-weight: 600;
	}

	.time {
		font-family: monospace;
	}
</style>
