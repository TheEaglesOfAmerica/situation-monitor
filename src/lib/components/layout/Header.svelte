<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { refresh, isRefreshing, lastRefresh, autoRefreshEnabled } from '$lib/stores';
	import { timeAgo } from '$lib/utils';
	import {
		isNotificationsEnabled,
		toggleNotifications,
		requestNotificationPermission
	} from '$lib/services/notifications';
	import { browser } from '$app/environment';

	interface Props {
		onRefresh?: () => void;
		onSettingsClick?: () => void;
		compactMode?: boolean;
		onCompactModeToggle?: () => void;
		allPanelsCollapsed?: boolean;
		onCollapseAllToggle?: () => void;
		visibilityDropdownOpen?: boolean;
		onVisibilityDropdownToggle?: () => void;
	}

	let { onRefresh, onSettingsClick, compactMode = false, onCompactModeToggle, allPanelsCollapsed = false, onCollapseAllToggle, visibilityDropdownOpen = false, onVisibilityDropdownToggle }: Props = $props();

	// Notification state
	let notificationsOn = $state(false);

	// Countdown timer state
	let countdown = $state('');
	let countdownTimer: ReturnType<typeof setInterval> | null = null;

	// Auto-refresh interval (1 hour = 3600000ms)
	const AUTO_REFRESH_INTERVAL = 60 * 60 * 1000;

	// Initialize notification state and countdown
	$effect(() => {
		if (browser) {
			notificationsOn = isNotificationsEnabled();
		}
	});

	function updateCountdown() {
		if (!$autoRefreshEnabled || !$lastRefresh) {
			countdown = '';
			return;
		}

		const elapsed = Date.now() - $lastRefresh;
		const remaining = Math.max(0, AUTO_REFRESH_INTERVAL - elapsed);
		
		if (remaining <= 0) {
			countdown = 'now';
			return;
		}

		const minutes = Math.floor(remaining / 60000);
		const seconds = Math.floor((remaining % 60000) / 1000);
		
		if (minutes > 0) {
			countdown = `${minutes}m`;
		} else {
			countdown = `${seconds}s`;
		}
	}

	onMount(() => {
		updateCountdown();
		countdownTimer = setInterval(updateCountdown, 1000);
	});

	onDestroy(() => {
		if (countdownTimer) {
			clearInterval(countdownTimer);
		}
	});

	function handleRefresh() {
		if (onRefresh && !$isRefreshing) {
			onRefresh();
		}
	}

	function handleToggleAutoRefresh() {
		refresh.toggleAutoRefresh(onRefresh);
	}

	async function handleToggleNotifications() {
		if (!isNotificationsEnabled()) {
			const granted = await requestNotificationPermission();
			if (!granted) {
				alert('Please enable notifications in your browser settings');
				return;
			}
		}
		notificationsOn = toggleNotifications();
	}

	const lastRefreshText = $derived(
		$lastRefresh ? `Last: ${timeAgo($lastRefresh)}` : 'Never refreshed'
	);
</script>

<header class="header" class:compact={compactMode}>
	<div class="header-left">
		<h1 class="logo">SITUATION MONITOR</h1>
	</div>

	<div class="header-center">
		<div class="refresh-status">
			{#if $isRefreshing}
				<span class="status-text loading">Refreshing...</span>
			{:else}
				<span class="status-text">{lastRefreshText}</span>
				{#if $autoRefreshEnabled && countdown}
					<span class="countdown">• Next: {countdown}</span>
				{/if}
			{/if}
		</div>
	</div>

	<div class="header-right">
		<!-- Collapse All Toggle -->
		<button
			class="header-btn"
			class:active={allPanelsCollapsed}
			onclick={onCollapseAllToggle}
			title={allPanelsCollapsed ? 'Expand all panels' : 'Collapse all panels'}
		>
			<span class="btn-icon">{allPanelsCollapsed ? '▼' : '▲'}</span>
			<span class="btn-label">{allPanelsCollapsed ? 'Expand' : 'Collapse'}</span>
		</button>

		<!-- Panel Visibility Toggle -->
		<button
			class="header-btn"
			class:active={visibilityDropdownOpen}
			onclick={onVisibilityDropdownToggle}
			title="Toggle panel visibility"
		>
			<span class="btn-icon">👁</span>
			<span class="btn-label">Panels</span>
		</button>

		<!-- Compact Mode Toggle -->
		<button
			class="header-btn"
			class:active={compactMode}
			onclick={onCompactModeToggle}
			title={compactMode ? 'Normal view' : 'Compact view'}
		>
			<span class="btn-icon">{compactMode ? '⊞' : '⊟'}</span>
			<span class="btn-label">{compactMode ? 'Normal' : 'Compact'}</span>
		</button>

		<!-- Notifications Toggle -->
		<button
			class="header-btn"
			class:active={notificationsOn}
			onclick={handleToggleNotifications}
			title={notificationsOn ? 'AI Notifications ON' : 'AI Notifications OFF'}
		>
			<span class="btn-icon">{notificationsOn ? '🔔' : '🔕'}</span>
			<span class="btn-label">{notificationsOn ? 'Alerts' : 'Alerts'}</span>
		</button>

		<button
			class="header-btn"
			class:active={$autoRefreshEnabled}
			onclick={handleToggleAutoRefresh}
			title={$autoRefreshEnabled ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
		>
			<span class="btn-icon">⟳</span>
			<span class="btn-label">{$autoRefreshEnabled ? 'Auto' : 'Manual'}</span>
		</button>

		<button
			class="header-btn refresh-btn"
			onclick={handleRefresh}
			disabled={$isRefreshing}
			title="Refresh all data"
		>
			<span class="btn-icon" class:spinning={$isRefreshing}>↻</span>
			<span class="btn-label">Refresh</span>
		</button>

		<button class="header-btn settings-btn" onclick={onSettingsClick} title="Settings">
			<span class="btn-icon">⚙</span>
			<span class="btn-label">Settings</span>
		</button>
	</div>
</header>

<style>
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 100;
		gap: 1rem;
	}

	.header-left {
		display: flex;
		align-items: baseline;
		flex-shrink: 0;
	}

	.logo {
		font-size: 0.9rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--text-primary);
		margin: 0;
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.header-center {
		display: flex;
		align-items: center;
		flex: 1;
		justify-content: center;
		min-width: 0;
	}

	.refresh-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.status-text {
		font-size: 0.6rem;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.status-text.loading {
		color: var(--accent);
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.header-btn {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 2.75rem;
		padding: 0.4rem 0.75rem;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.15s ease;
		font-size: 0.65rem;
	}

	.header-btn:hover:not(:disabled) {
		background: var(--border);
		color: var(--text-primary);
	}

	.header-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.header-btn.active {
		background: rgba(var(--accent-rgb), 0.1);
		border-color: var(--accent);
		color: var(--accent);
	}

	.btn-icon {
		font-size: 0.8rem;
	}

	.btn-icon.spinning {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.btn-label {
		display: none;
	}

	.countdown {
		font-size: 0.55rem;
		color: var(--accent);
		white-space: nowrap;
	}

	.header.compact {
		padding: 0.25rem 0.75rem;
	}

	.header.compact .logo {
		font-size: 0.75rem;
	}

	.header.compact .header-btn {
		padding: 0.25rem 0.5rem;
		min-height: 2rem;
	}

	@media (min-width: 768px) {
		.btn-label {
			display: inline;
		}
	}
</style>
