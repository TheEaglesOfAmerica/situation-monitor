<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { Header, Dashboard } from '$lib/components/layout';
	import { SettingsModal, MonitorFormModal, OnboardingModal } from '$lib/components/modals';
	import {
		NewsPanel,
		MarketsPanel,
		HeatmapPanel,
		CommoditiesPanel,
		CryptoPanel,
		MainCharPanel,
		CorrelationPanel,
		NarrativePanel,
		MonitorsPanel,
		MapPanel,
		WhalePanel,
		PolymarketPanel,
		ContractsPanel,
		LayoffsPanel,
		IntelPanel,
		SituationPanel
	} from '$lib/components/panels';
	import {
		news,
		politicsNews,
		techNews,
		financeNews,
		govNews,
		aiNews,
		intelNews,
		markets,
		monitors,
		settings,
		refresh
	} from '$lib/stores';
	import {
		fetchAllNews,
		fetchAllMarkets,
		fetchPolymarket,
		fetchWhaleTransactions,
		fetchGovContracts,
		fetchLayoffs
	} from '$lib/api';
	import { initNotifications, processHeadlines, toggleNotifications } from '$lib/services/notifications';
	import type { Prediction, WhaleTransaction, Contract, Layoff } from '$lib/api';
	import type { CustomMonitor } from '$lib/types';

	// Modal state
	let settingsOpen = $state(false);
	let monitorFormOpen = $state(false);
	let onboardingOpen = $state(false);
	let editingMonitor = $state<CustomMonitor | null>(null);

	// Edit mode for panel rearrangement
	let editMode = $state(false);

	// Compact mode for reduced padding
	let compactMode = $state(false);

	// Misc panel data
	let predictions = $state<Prediction[]>([]);
	let whales = $state<WhaleTransaction[]>([]);
	let contracts = $state<Contract[]>([]);
	let layoffs = $state<Layoff[]>([]);

	// Derived data for panels that need aggregated news
	const allNewsItems = $derived([
		...$politicsNews.items,
		...$techNews.items,
		...$financeNews.items,
		...$govNews.items,
		...$aiNews.items,
		...$intelNews.items
	]);

	// Data fetching
	async function loadNews() {
		// Set loading for all categories
		const categories = ['politics', 'tech', 'finance', 'gov', 'ai', 'intel'] as const;
		categories.forEach((cat) => news.setLoading(cat, true));

		try {
			const data = await fetchAllNews();
			Object.entries(data).forEach(([category, items]) => {
				news.setItems(category as keyof typeof data, items);
			});
			
			// Process headlines for AI notifications
			const allItems = Object.values(data).flat();
			processHeadlines(allItems);
		} catch (error) {
			categories.forEach((cat) => news.setError(cat, String(error)));
		}
	}

	async function loadMarkets() {
		try {
			const data = await fetchAllMarkets();
			markets.setIndices(data.indices);
			markets.setSectors(data.sectors);
			markets.setCommodities(data.commodities);
			markets.setCrypto(data.crypto);
		} catch (error) {
			console.error('Failed to load markets:', error);
		}
	}

	async function loadMiscData() {
		try {
			const [predictionsData, whalesData, contractsData, layoffsData] = await Promise.all([
				fetchPolymarket(),
				fetchWhaleTransactions(),
				fetchGovContracts(),
				fetchLayoffs()
			]);
			predictions = predictionsData;
			whales = whalesData;
			contracts = contractsData;
			layoffs = layoffsData;
		} catch (error) {
			console.error('Failed to load misc data:', error);
		}
	}

	// Refresh handlers
	async function handleRefresh() {
		refresh.startRefresh();
		try {
			await Promise.all([loadNews(), loadMarkets()]);
			refresh.endRefresh();
		} catch (error) {
			refresh.endRefresh([String(error)]);
		}
	}

	// Monitor handlers
	function handleCreateMonitor() {
		editingMonitor = null;
		monitorFormOpen = true;
	}

	function handleEditMonitor(monitor: CustomMonitor) {
		editingMonitor = monitor;
		monitorFormOpen = true;
	}

	function handleDeleteMonitor(id: string) {
		monitors.deleteMonitor(id);
	}

	function handleToggleMonitor(id: string) {
		monitors.toggleMonitor(id);
	}

	// Get panel visibility
	const isPanelVisible = (id: string) =>
		$settings.enabled[id as keyof typeof $settings.enabled] !== false;

	// Handle preset selection from onboarding
	function handleSelectPreset(presetId: string) {
		settings.applyPreset(presetId);
		onboardingOpen = false;
		// Refresh data after applying preset
		handleRefresh();
	}

	// Show onboarding again (called from settings)
	function handleReconfigure() {
		settingsOpen = false;
		settings.resetOnboarding();
		onboardingOpen = true;
	}

	// Initial load
	onMount(() => {
		// Initialize notifications system
		initNotifications();

		// Check if first visit
		if (!settings.isOnboardingComplete()) {
			onboardingOpen = true;
		}

		// Load compact mode from localStorage
		if (browser) {
			compactMode = localStorage.getItem('compactMode') === 'true';
		}

		loadNews();
		loadMarkets();
		loadMiscData();
		refresh.setupAutoRefresh(handleRefresh);

		// Add keyboard shortcuts
		window.addEventListener('keydown', handleKeydown);

		return () => {
			refresh.stopAutoRefresh();
			window.removeEventListener('keydown', handleKeydown);
		};
	});

	// Keyboard shortcuts handler
	function handleKeydown(e: KeyboardEvent) {
		// Skip if typing in input or textarea
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			return;
		}

		// Skip if any modifier key is pressed (except for intended combos)
		if (e.metaKey || e.ctrlKey || e.altKey) {
			return;
		}

		switch (e.key.toLowerCase()) {
			case 'e':
				// Toggle edit mode
				e.preventDefault();
				handleEditModeToggle();
				break;
			case 'r':
				// Refresh data
				e.preventDefault();
				handleRefresh();
				break;
			case 'n':
				// Toggle notifications
				e.preventDefault();
				toggleNotifications();
				break;
			case 'c':
				// Toggle compact mode
				e.preventDefault();
				handleCompactModeToggle();
				break;
			case 's':
				// Open settings
				e.preventDefault();
				settingsOpen = true;
				break;
			case 'escape':
				// Exit edit mode or close modals
				if (editMode) {
					editMode = false;
				} else if (settingsOpen) {
					settingsOpen = false;
				}
				break;
		}
	}

	// Toggle edit mode
	function handleEditModeToggle() {
		editMode = !editMode;
	}

	// Toggle compact mode
	function handleCompactModeToggle() {
		compactMode = !compactMode;
		if (browser) {
			localStorage.setItem('compactMode', String(compactMode));
		}
	}
</script>

<svelte:head>
	<title>Situation Monitor</title>
	<meta name="description" content="Real-time global situation monitoring dashboard" />
</svelte:head>

<div class="app">
	<Header 
		onRefresh={handleRefresh} 
		onSettingsClick={() => (settingsOpen = true)} 
		{editMode}
		onEditModeToggle={handleEditModeToggle}
		{compactMode}
		onCompactModeToggle={handleCompactModeToggle}
	/>

	<main class="main-content" class:compact={compactMode}>
		<Dashboard {editMode} {compactMode}>
			<!-- Panels rendered in order specified by settings.order -->
			{#each $settings.order as panelId (panelId)}
				{#if isPanelVisible(panelId)}
					{#if panelId === 'map'}
						<div class="panel-slot map-slot" data-panel-id="map" draggable={editMode}>
							<MapPanel monitors={$monitors.monitors} />
						</div>
					{:else if panelId === 'politics'}
						<div class="panel-slot" data-panel-id="politics" draggable={editMode}>
							<NewsPanel category="politics" panelId="politics" title="Politics" />
						</div>
					{:else if panelId === 'tech'}
						<div class="panel-slot" data-panel-id="tech" draggable={editMode}>
							<NewsPanel category="tech" panelId="tech" title="Tech" />
						</div>
					{:else if panelId === 'finance'}
						<div class="panel-slot" data-panel-id="finance" draggable={editMode}>
							<NewsPanel category="finance" panelId="finance" title="Finance" />
						</div>
					{:else if panelId === 'gov'}
						<div class="panel-slot" data-panel-id="gov" draggable={editMode}>
							<NewsPanel category="gov" panelId="gov" title="Government" />
						</div>
					{:else if panelId === 'ai'}
						<div class="panel-slot" data-panel-id="ai" draggable={editMode}>
							<NewsPanel category="ai" panelId="ai" title="AI" />
						</div>

					{:else if panelId === 'markets'}
						<div class="panel-slot" data-panel-id="markets" draggable={editMode}>
							<MarketsPanel />
						</div>
					{:else if panelId === 'heatmap'}
						<div class="panel-slot" data-panel-id="heatmap" draggable={editMode}>
							<HeatmapPanel />
						</div>
					{:else if panelId === 'commodities'}
						<div class="panel-slot" data-panel-id="commodities" draggable={editMode}>
							<CommoditiesPanel />
						</div>
					{:else if panelId === 'crypto'}
						<div class="panel-slot" data-panel-id="crypto" draggable={editMode}>
							<CryptoPanel />
						</div>

					{:else if panelId === 'mainchar'}
						<div class="panel-slot" data-panel-id="mainchar" draggable={editMode}>
							<MainCharPanel />
						</div>
					{:else if panelId === 'correlation'}
						<div class="panel-slot" data-panel-id="correlation" draggable={editMode}>
							<CorrelationPanel />
						</div>
					{:else if panelId === 'narrative'}
						<div class="panel-slot" data-panel-id="narrative" draggable={editMode}>
							<NarrativePanel news={allNewsItems} />
						</div>
					{:else if panelId === 'monitors'}
						<div class="panel-slot" data-panel-id="monitors" draggable={editMode}>
							<MonitorsPanel
								monitors={$monitors.monitors}
								matches={$monitors.matches}
								onCreateMonitor={handleCreateMonitor}
								onEditMonitor={handleEditMonitor}
								onDeleteMonitor={handleDeleteMonitor}
								onToggleMonitor={handleToggleMonitor}
							/>
						</div>
					{:else if panelId === 'intel'}
						<div class="panel-slot" data-panel-id="intel" draggable={editMode}>
							<IntelPanel />
						</div>
					{:else if panelId === 'venezuela'}
						<div class="panel-slot" data-panel-id="venezuela" draggable={editMode}>
							<SituationPanel
								panelId="venezuela"
								config={{
									title: 'Venezuela Watch',
									subtitle: 'Humanitarian crisis monitoring',
									criticalKeywords: ['maduro', 'caracas', 'venezuela', 'guaido']
								}}
								news={allNewsItems.filter(
									(n) =>
										n.title.toLowerCase().includes('venezuela') ||
										n.title.toLowerCase().includes('maduro')
								)}
							/>
						</div>
					{:else if panelId === 'greenland'}
						<div class="panel-slot" data-panel-id="greenland" draggable={editMode}>
							<SituationPanel
								panelId="greenland"
								config={{
									title: 'Greenland Watch',
									subtitle: 'Arctic geopolitics monitoring',
									criticalKeywords: ['greenland', 'arctic', 'nuuk', 'denmark']
								}}
								news={allNewsItems.filter(
									(n) =>
										n.title.toLowerCase().includes('greenland') ||
										n.title.toLowerCase().includes('arctic')
								)}
							/>
						</div>
					{:else if panelId === 'iran'}
						<div class="panel-slot" data-panel-id="iran" draggable={editMode}>
							<SituationPanel
								panelId="iran"
								config={{
									title: 'Iran Crisis',
									subtitle: 'Revolution protests, regime instability & nuclear program',
									criticalKeywords: [
										'protest',
										'uprising',
										'revolution',
										'crackdown',
										'killed',
										'nuclear',
										'strike',
										'attack',
										'irgc',
										'khamenei'
									]
								}}
								news={allNewsItems.filter(
									(n) =>
										n.title.toLowerCase().includes('iran') ||
										n.title.toLowerCase().includes('tehran') ||
										n.title.toLowerCase().includes('irgc')
								)}
							/>
						</div>
					{:else if panelId === 'whale'}
						<div class="panel-slot" data-panel-id="whale" draggable={editMode}>
							<WhalePanel transactions={whales} />
						</div>
					{:else if panelId === 'polymarket'}
						<div class="panel-slot" data-panel-id="polymarket" draggable={editMode}>
							<PolymarketPanel predictions={predictions} />
						</div>
					{:else if panelId === 'contracts'}
						<div class="panel-slot" data-panel-id="contracts" draggable={editMode}>
							<ContractsPanel contracts={contracts} />
						</div>
					{:else if panelId === 'layoffs'}
						<div class="panel-slot" data-panel-id="layoffs" draggable={editMode}>
							<LayoffsPanel layoffs={layoffs} />
						</div>
					{/if}
			{/if}
		{/each}
	</Dashboard>
</main>
	<!-- Modals -->
	<SettingsModal
		open={settingsOpen}
		onClose={() => (settingsOpen = false)}
		onReconfigure={handleReconfigure}
	/>
	<MonitorFormModal
		open={monitorFormOpen}
		onClose={() => (monitorFormOpen = false)}
		editMonitor={editingMonitor}
	/>
	<OnboardingModal open={onboardingOpen} onSelectPreset={handleSelectPreset} />
</div>

<style>
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
	}

	.main-content {
		flex: 1;
		padding: 0.5rem;
		overflow-y: auto;
	}

	.map-slot {
		column-span: all;
		margin-bottom: 0.5rem;
	}

	@media (max-width: 768px) {
		.main-content {
			padding: 0.25rem;
		}
	}
</style>
