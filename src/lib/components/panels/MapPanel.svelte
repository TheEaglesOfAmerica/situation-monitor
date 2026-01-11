<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { Panel } from '$lib/components/common';
	import {
		HOTSPOTS,
		CONFLICT_ZONES,
		CHOKEPOINTS,
		CABLE_LANDINGS,
		NUCLEAR_SITES,
		MILITARY_BASES,
		OCEANS,
		SANCTIONED_COUNTRY_IDS,
		THREAT_COLORS,
		WEATHER_CODES,
		calculateEmergentScore,
		calculateScoreBreakdown,
		getEmergentColor,
		getEmergentLabel
	} from '$lib/config/map';
	import { WORLD_CITIES } from '$lib/config/world-cities';
	import type { Hotspot, ScoreBreakdown } from '$lib/config/map';
	import { CACHE_TTLS } from '$lib/config/api';
	import type { CustomMonitor, NewsItem } from '$lib/types';

	interface Props {
		monitors?: CustomMonitor[];
		news?: NewsItem[];
		loading?: boolean;
		error?: string | null;
	}

	let { monitors = [], news = [], loading = false, error = null }: Props = $props();

	let mapContainer: HTMLDivElement;
	// D3 objects - initialized in initMap, null before initialization
	// Using 'any' for D3 objects as they're dynamically imported and have complex generic types
	/* eslint-disable @typescript-eslint/no-explicit-any */
	let d3Module: typeof import('d3') | null = null;
	let svg: any = null;
	let mapGroup: any = null;
	let hotspotsLayer: any = null;
	let weatherLayer: any = null;
	let projection: any = null;
	let path: any = null;
	let zoom: any = null;
	/* eslint-enable @typescript-eslint/no-explicit-any */

	const WIDTH = 800;
	const HEIGHT = 400;

	// Search state
	let searchQuery = $state('');
	let searchOpen = $state(false);
	let selectedHotspot = $state<Hotspot | null>(null);
	let selectedBreakdown = $state<ScoreBreakdown | null>(null);

	// Filter state
	let showCities = $state(true);
	let filterMenuOpen = $state(false);
	let minPopulation = $state(0.75); // in millions
	let minThreatScore = $state(0);
	let selectedRegions = $state<Set<string>>(new Set(['all']));
	let selectedLevels = $state<Set<string>>(new Set(['all']));

	// Zoom level state
	let currentZoom = $state(1);
	const MIN_ZOOM = 1;
	const MAX_ZOOM = 6;

	// Filtered hotspots for search
	const filteredHotspots = $derived(
		searchQuery.trim()
			? allCitiesWithScores.filter(
					(h) =>
						h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
						h.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
						h.country.toLowerCase().includes(searchQuery.toLowerCase())
			  )
			: allCitiesWithScores.slice(0, 10)
	);

	// Get recent news for a location
	function getLocationNews(locationName: string): NewsItem[] {
		const keywords = locationName.toLowerCase().split(/[,\s]+/);
		return news
			.filter(item => {
				const text = (item.title + ' ' + item.description).toLowerCase();
				return keywords.some(keyword => text.includes(keyword));
			})
			.sort((a, b) => b.timestamp - a.timestamp)
			.slice(0, 5);
	}

	// Get region from country name
	function getRegionFromCountry(country: string): string {
		const asia = ['Japan', 'China', 'India', 'South Korea', 'North Korea', 'Bangladesh', 'Pakistan', 'Philippines', 'Indonesia', 'Thailand', 'Vietnam', 'Myanmar', 'Afghanistan', 'Nepal', 'Sri Lanka', 'Kazakhstan', 'Uzbekistan', 'Taiwan', 'Malaysia', 'Singapore'];
		const middleEast = ['Iran', 'Iraq', 'Saudi Arabia', 'UAE', 'Israel', 'Turkey', 'Syria', 'Lebanon', 'Jordan', 'Qatar', 'Kuwait', 'Yemen', 'Oman'];
		const africa = ['Egypt', 'Algeria', 'Morocco', 'Tunisia', 'Libya', 'Nigeria', 'DR Congo', 'Kenya', 'Angola', 'Tanzania', 'Sudan', 'South Africa', 'Ethiopia', 'Ivory Coast', 'Uganda', 'Ghana', 'Senegal', 'Cameroon', 'Somalia'];
		const europe = ['Russia', 'UK', 'France', 'Spain', 'Germany', 'Italy', 'Ukraine', 'Belgium', 'Austria', 'Poland', 'Hungary', 'Romania', 'Belarus', 'Sweden', 'Denmark', 'Netherlands', 'Greece', 'Czech Republic', 'Bulgaria', 'Serbia'];
		const northAmerica = ['USA', 'Canada', 'Mexico', 'Cuba'];
		const southAmerica = ['Brazil', 'Argentina', 'Peru', 'Colombia', 'Chile', 'Venezuela', 'Ecuador'];
		const oceania = ['Australia', 'New Zealand'];
		
		if (asia.includes(country)) return 'Asia';
		if (middleEast.includes(country)) return 'Middle East';
		if (africa.includes(country)) return 'Africa';
		if (europe.includes(country)) return 'Europe';
		if (northAmerica.includes(country)) return 'N. America';
		if (southAmerica.includes(country)) return 'S. America';
		if (oceania.includes(country)) return 'Oceania';
		return 'Other';
	}

	// Merge world cities with threat data, auto-calculate scores
	const allCitiesWithScores = $derived(
		WORLD_CITIES.map((city) => {
			const level = city.level || 'low';
			const emergentScore = calculateEmergentScore(level, Math.random() * 0.3 + 0.35);
			return {
				...city,
				level,
				emergentScore,
				desc: city.desc || `${city.name} — ${city.country} (${city.population}M pop)`
			};
		})
	);

	// Filter: Show cities with population >= minPop OR threat score >= minThreat
	// Also apply region and level filters
	const visibleHotspots = $derived((() => {
		if (!showCities) return [];
		
		return allCitiesWithScores.filter((city) => {
			// Population or threat threshold
			const meetsThreshold = city.population >= minPopulation || city.emergentScore >= minThreatScore;
			if (!meetsThreshold) return false;
			
			// Region filter
			if (!selectedRegions.has('all')) {
				const region = getRegionFromCountry(city.country);
				if (!selectedRegions.has(region)) return false;
			}
			
			// Threat level filter
			if (!selectedLevels.has('all')) {
				if (!selectedLevels.has(city.level)) return false;
			}
			
			return true;
		});
	})());

	// Critical situations (score >= 70)
	const criticalSituations = $derived(
		allCitiesWithScores.filter((h) => h.emergentScore >= 70).sort((a, b) => b.emergentScore - a.emergentScore)
	);

	const WEATHER_WATCH_NAMES = [
		'Seattle',
		'Novosibirsk',
		'Sydney',
		'London',
		'Tokyo',
		'Kyiv',
		'Singapore'
	];
	const WEATHER_WATCH = WEATHER_WATCH_NAMES.map((name) =>
		allCitiesWithScores.find((h) => h.name === name)
	).filter(Boolean);

	// Tooltip state
	let tooltipContent = $state<{
		title: string;
		color: string;
		lines: string[];
	} | null>(null);
	let tooltipPosition = $state({ left: 0, top: 0 });
	let tooltipVisible = $state(false);

	// Data cache for tooltips with TTL support
	interface CacheEntry<T> {
		data: T;
		timestamp: number;
	}
	const dataCache: Record<string, CacheEntry<unknown>> = {};

	const OVERLAY_STORAGE_KEY = 'mapWeatherOverlay';

	// Weather overlay state
	let weatherOverlayEnabled = $state(false);
	let weatherSnapshots = $state<Record<string, WeatherResult | null>>({});
	let weatherUpdatedAt = $state<string | null>(null);
	let weatherTimer: number | null = null;

	function getCachedData<T>(key: string): T | null {
		const entry = dataCache[key] as CacheEntry<T> | undefined;
		if (!entry) return null;
		// Check if cache entry has expired
		if (Date.now() - entry.timestamp > CACHE_TTLS.weather) {
			delete dataCache[key];
			return null;
		}
		return entry.data;
	}

	function setCachedData<T>(key: string, data: T): void {
		dataCache[key] = { data, timestamp: Date.now() };
	}

	function tempToColor(temp: number | null): string {
		if (temp === null || Number.isNaN(temp)) return 'rgba(255,255,255,0.15)';
		if (temp <= 32) return 'rgba(0, 136, 255, 0.35)';
		if (temp <= 50) return 'rgba(0, 200, 255, 0.35)';
		if (temp <= 68) return 'rgba(0, 220, 170, 0.35)';
		if (temp <= 85) return 'rgba(255, 180, 0, 0.35)';
		return 'rgba(255, 80, 80, 0.35)';
	}

	// Get local time at longitude
	function getLocalTime(lon: number): string {
		const now = new Date();
		const utcHours = now.getUTCHours();
		const utcMinutes = now.getUTCMinutes();
		const offsetHours = Math.round(lon / 15);
		let localHours = (utcHours + offsetHours + 24) % 24;
		const ampm = localHours >= 12 ? 'PM' : 'AM';
		localHours = localHours % 12 || 12;
		return `${localHours}:${utcMinutes.toString().padStart(2, '0')} ${ampm}`;
	}

	// Weather result type
	interface WeatherResult {
		temp: number | null;
		wind: number | null;
		condition: string;
	}

	// Fetch weather from Open-Meteo with TTL-based caching
	async function getWeather(lat: number, lon: number): Promise<WeatherResult | null> {
		const key = `weather_${lat}_${lon}`;
		const cached = getCachedData<WeatherResult>(key);
		if (cached) return cached;

		try {
			const res = await fetch(
				`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m`
			);
			const data = await res.json();
			const temp = data.current?.temperature_2m;
			const tempF = temp ? Math.round((temp * 9) / 5 + 32) : null;
			const wind = data.current?.wind_speed_10m;
			const code = data.current?.weather_code;
			const result: WeatherResult = {
				temp: tempF,
				wind: wind ? Math.round(wind) : null,
				condition: WEATHER_CODES[code] || '—'
			};
			setCachedData(key, result);
			return result;
		} catch {
			return null;
		}
	}

	async function refreshWeatherSnapshots(): Promise<void> {
		try {
			const entries = await Promise.all(
				WEATHER_WATCH.map(async (point) => {
					const reading = await getWeather(point.lat, point.lon);
					return [point.name, reading] as const;
				})
			);
			weatherSnapshots = Object.fromEntries(entries);
			weatherUpdatedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
			if (weatherOverlayEnabled) {
				renderWeatherOverlay();
			}
		} catch (err) {
			console.error('Failed to refresh weather snapshots', err);
		}
	}

	function renderWeatherOverlay(): void {
		if (!weatherLayer || !projection) return;
		weatherLayer.selectAll('*').remove();
		if (!weatherOverlayEnabled) return;

		WEATHER_WATCH.forEach((point) => {
			const [x, y] = projection([point.lon, point.lat]) || [0, 0];
			if (!x || !y) return;
			const weather = weatherSnapshots[point.name];
			const ringColor = tempToColor(weather?.temp ?? null);

			weatherLayer
				.append('circle')
				.attr('cx', x)
				.attr('cy', y)
				.attr('r', 16)
				.attr('fill', ringColor)
				.attr('stroke', 'rgba(255,255,255,0.1)')
				.attr('stroke-width', 1.5);
			weatherLayer
				.append('text')
				.attr('x', x + 10)
				.attr('y', y - 8)
				.attr('fill', '#cde7ff')
				.attr('font-size', '8px')
				.attr('font-family', 'monospace')
				.text(point.name);
			if (weather?.condition) {
				weatherLayer
					.append('text')
					.attr('x', x + 10)
					.attr('y', y + 4)
					.attr('fill', '#9ad1ff')
					.attr('font-size', '7px')
					.attr('font-family', 'monospace')
					.text(`${weather.condition} ${weather.temp ?? '—'}°`);
			}
		});
	}

	const FOCUS_TARGETS = [
		{ label: 'Americas', lat: 15, lon: -90, scale: 1.8 },
		{ label: 'Europe', lat: 50, lon: 15, scale: 2.5 },
		{ label: 'Middle East', lat: 30, lon: 45, scale: 2.8 },
		{ label: 'Asia-Pacific', lat: 25, lon: 115, scale: 2.0 },
		{ label: 'Africa', lat: 5, lon: 20, scale: 2.0 }
	];

	function focusOn(lon: number, lat: number, scale = 2): void {
		if (!projection || !zoom || !svg || !d3Module) return;
		const point = projection([lon, lat]);
		if (!point) return;
		const [x, y] = point;
		const t = d3Module.zoomIdentity
			.translate(WIDTH / 2 - x * scale, HEIGHT / 2 - y * scale)
			.scale(scale);
		svg.transition().duration(450).call(zoom.transform, t);
		currentZoom = scale;
	}

	function focusTarget(label: string): void {
		const target = FOCUS_TARGETS.find((t) => t.label === label);
		if (!target) return;
		focusOn(target.lon, target.lat, target.scale);
	}

	function focusHotspot(hotspot: Hotspot): void {
		selectedHotspot = hotspot;
		selectedBreakdown = calculateScoreBreakdown(hotspot);
		searchOpen = false;
		searchQuery = '';
		focusOn(hotspot.lon, hotspot.lat, 3.5);
	}

	function clearSelection(): void {
		selectedHotspot = null;
		selectedBreakdown = null;
	}

	function toggleRegion(region: string): void {
		if (region === 'all') {
			selectedRegions = new Set(['all']);
		} else {
			const newRegions = new Set(selectedRegions);
			newRegions.delete('all');
			if (newRegions.has(region)) {
				newRegions.delete(region);
			} else {
				newRegions.add(region);
			}
			if (newRegions.size === 0) newRegions.add('all');
			selectedRegions = newRegions;
		}
	}

	function toggleLevel(level: string): void {
		if (level === 'all') {
			selectedLevels = new Set(['all']);
		} else {
			const newLevels = new Set(selectedLevels);
			newLevels.delete('all');
			if (newLevels.has(level)) {
				newLevels.delete(level);
			} else {
				newLevels.add(level);
			}
			if (newLevels.size === 0) newLevels.add('all');
			selectedLevels = newLevels;
		}
	}

	function handleSearchSelect(hotspot: Hotspot): void {
		focusHotspot(hotspot);
	}

	function handleZoomSlider(e: Event): void {
		const target = e.target as HTMLInputElement;
		const newZoom = parseFloat(target.value);
		if (!svg || !zoom || !d3Module) return;
		svg.transition().duration(200).call(zoom.scaleTo, newZoom);
		currentZoom = newZoom;
	}

	function toggleWeatherOverlay(): void {
		weatherOverlayEnabled = !weatherOverlayEnabled;
		if (browser) {
			localStorage.setItem(OVERLAY_STORAGE_KEY, weatherOverlayEnabled ? '1' : '0');
		}
		if (weatherOverlayEnabled) {
			renderWeatherOverlay();
		} else if (weatherLayer) {
			weatherLayer.selectAll('*').remove();
		}
	}

	// Enable zoom/pan behavior on the map
	function enableZoom(): void {
		if (!svg || !zoom) return;
		svg.call(zoom);
	}

	// Calculate day/night terminator points
	function calculateTerminator(): [number, number][] {
		const now = new Date();
		const dayOfYear = Math.floor(
			(now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
		);
		const declination = -23.45 * Math.cos(((360 / 365) * (dayOfYear + 10) * Math.PI) / 180);
		const hourAngle = (now.getUTCHours() + now.getUTCMinutes() / 60) * 15 - 180;

		const terminatorPoints: [number, number][] = [];
		for (let lat = -90; lat <= 90; lat += 2) {
			const tanDec = Math.tan((declination * Math.PI) / 180);
			const tanLat = Math.tan((lat * Math.PI) / 180);
			let lon = -hourAngle + (Math.acos(-tanDec * tanLat) * 180) / Math.PI;
			if (isNaN(lon)) lon = lat * declination > 0 ? -hourAngle + 180 : -hourAngle;
			terminatorPoints.push([lon, lat]);
		}
		for (let lat = 90; lat >= -90; lat -= 2) {
			const tanDec = Math.tan((declination * Math.PI) / 180);
			const tanLat = Math.tan((lat * Math.PI) / 180);
			let lon = -hourAngle - (Math.acos(-tanDec * tanLat) * 180) / Math.PI;
			if (isNaN(lon)) lon = lat * declination > 0 ? -hourAngle - 180 : -hourAngle;
			terminatorPoints.push([lon, lat]);
		}
		return terminatorPoints;
	}

	// Show tooltip using state (safe rendering)
	function showTooltip(
		event: MouseEvent,
		title: string,
		color: string,
		lines: string[] = []
	): void {
		if (!mapContainer) return;
		const rect = mapContainer.getBoundingClientRect();
		tooltipContent = { title, color, lines };
		tooltipPosition = {
			left: event.clientX - rect.left + 15,
			top: event.clientY - rect.top - 10
		};
		tooltipVisible = true;
	}

	// Move tooltip
	function moveTooltip(event: MouseEvent): void {
		if (!mapContainer) return;
		const rect = mapContainer.getBoundingClientRect();
		tooltipPosition = {
			left: event.clientX - rect.left + 15,
			top: event.clientY - rect.top - 10
		};
	}

	// Hide tooltip
	function hideTooltip(): void {
		tooltipVisible = false;
		tooltipContent = null;
	}

	// Build enhanced tooltip with weather and news
	async function showEnhancedTooltip(
		event: MouseEvent,
		name: string,
		lat: number,
		lon: number,
		desc: string,
		color: string
	): Promise<void> {
		const localTime = getLocalTime(lon);
		const locationNews = getLocationNews(name);
		
		const newsLines = locationNews.length > 0 
			? ['', '📰 Recent News:', ...locationNews.map(n => `• ${n.title.slice(0, 60)}...`)]
			: [];
		
		const lines = [`🕐 Local: ${localTime}`, ...newsLines];
		showTooltip(event, desc, color, lines);

		// Fetch weather asynchronously
		const weather = await getWeather(lat, lon);
		if (weather && tooltipVisible) {
			tooltipContent = {
				title: desc,
				color,
				lines: [
					`🕐 Local: ${localTime}`,
					`${weather.condition} ${weather.temp}°F, ${weather.wind}mph`,
					...newsLines
				]
			};
		}
	}

	// Initialize map
	async function initMap(): Promise<void> {
		const d3 = await import('d3');
		d3Module = d3;
		const topojson = await import('topojson-client');

		const svgEl = mapContainer.querySelector('svg');
		if (!svgEl) return;

		svg = d3.select(svgEl);
		svg.attr('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);

		mapGroup = svg.append('g').attr('id', 'mapGroup');
		hotspotsLayer = mapGroup.append('g').attr('id', 'hotspotsLayer');
		weatherLayer = mapGroup.append('g').attr('id', 'weatherLayer');

		// Setup zoom - allow cmd/ctrl+scroll on desktop, touch pinch on mobile
		zoom = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([MIN_ZOOM, MAX_ZOOM])
			.filter((event) => {
				// Allow wheel zoom only with cmd/ctrl key (desktop)
				if (event.type === 'wheel') {
					return event.metaKey || event.ctrlKey;
				}
				// Allow touch events (pinch zoom on mobile)
				if (event.type.startsWith('touch')) return true;
				// Allow mouse drag for panning
				if (event.type === 'mousedown' || event.type === 'mousemove') return true;
				// Block double-click zoom
				if (event.type === 'dblclick') return false;
				// Allow other events (programmatic zoom from buttons)
				return true;
			})
			.on('zoom', (event) => {
				mapGroup.attr('transform', event.transform.toString());
				currentZoom = event.transform.k;
			});

		enableZoom();

		// Setup projection
		projection = d3
			.geoEquirectangular()
			.scale(130)
			.center([0, 20])
			.translate([WIDTH / 2, HEIGHT / 2 - 30]);

		path = d3.geoPath().projection(projection);

		// Load world data
		try {
			const response = await fetch(
				'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'
			);
			const world = await response.json();
			const countries = topojson.feature(
				world,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				world.objects.countries as any
			) as unknown as GeoJSON.FeatureCollection;

			// Draw countries
			mapGroup
				.selectAll('path.country')
				.data(countries.features)
				.enter()
				.append('path')
				.attr('class', 'country')
				.attr('d', path as unknown as string)
				.attr('fill', (d: GeoJSON.Feature) =>
					SANCTIONED_COUNTRY_IDS.includes(+(d.id || 0)) ? '#2a1a1a' : '#0f3028'
				)
				.attr('stroke', (d: GeoJSON.Feature) =>
					SANCTIONED_COUNTRY_IDS.includes(+(d.id || 0)) ? '#4a2020' : '#1a5040'
				)
				.attr('stroke-width', 0.5);

			// Draw graticule
			const graticule = d3.geoGraticule().step([30, 30]);
			mapGroup
				.append('path')
				.datum(graticule)
				.attr('d', path as unknown as string)
				.attr('fill', 'none')
				.attr('stroke', '#1a3830')
				.attr('stroke-width', 0.3)
				.attr('stroke-dasharray', '2,2');

			// Draw ocean labels
			OCEANS.forEach((o) => {
				const [x, y] = projection([o.lon, o.lat]) || [0, 0];
				if (x && y) {
					mapGroup
						.append('text')
						.attr('x', x)
						.attr('y', y)
						.attr('fill', '#1a4a40')
						.attr('font-size', '10px')
						.attr('font-family', 'monospace')
						.attr('text-anchor', 'middle')
						.attr('opacity', 0.6)
						.text(o.name);
				}
			});

			// Draw day/night terminator
			const terminatorPoints = calculateTerminator();
			mapGroup
				.append('path')
				.datum({ type: 'Polygon', coordinates: [terminatorPoints] } as GeoJSON.Polygon)
				.attr('d', path as unknown as string)
				.attr('fill', 'rgba(0,0,0,0.3)')
				.attr('stroke', 'none');

			// Draw conflict zones
			CONFLICT_ZONES.forEach((zone) => {
				mapGroup
					.append('path')
					.datum({ type: 'Polygon', coordinates: [zone.coords] } as GeoJSON.Polygon)
					.attr('d', path as unknown as string)
					.attr('fill', zone.color)
					.attr('fill-opacity', 0.15)
					.attr('stroke', zone.color)
					.attr('stroke-width', 0.5)
					.attr('stroke-opacity', 0.4);
			});

			// Draw chokepoints
			CHOKEPOINTS.forEach((cp) => {
				const [x, y] = projection([cp.lon, cp.lat]) || [0, 0];
				if (x && y) {
					mapGroup
						.append('rect')
						.attr('x', x - 4)
						.attr('y', y - 4)
						.attr('width', 8)
						.attr('height', 8)
						.attr('fill', '#00aaff')
						.attr('opacity', 0.8)
						.attr('transform', `rotate(45,${x},${y})`);
					mapGroup
						.append('text')
						.attr('x', x + 8)
						.attr('y', y + 3)
						.attr('fill', '#00aaff')
						.attr('font-size', '7px')
						.attr('font-family', 'monospace')
						.text(cp.name);
					mapGroup
						.append('circle')
						.attr('cx', x)
						.attr('cy', y)
						.attr('r', 10)
						.attr('fill', 'transparent')
						.attr('class', 'hotspot-hit')
						.on('mouseenter', (event: MouseEvent) => showTooltip(event, `⬥ ${cp.desc}`, '#00aaff'))
						.on('mousemove', moveTooltip)
						.on('mouseleave', hideTooltip);
				}
			});

			// Draw cable landings
			CABLE_LANDINGS.forEach((cl) => {
				const [x, y] = projection([cl.lon, cl.lat]) || [0, 0];
				if (x && y) {
					mapGroup
						.append('circle')
						.attr('cx', x)
						.attr('cy', y)
						.attr('r', 3)
						.attr('fill', 'none')
						.attr('stroke', '#aa44ff')
						.attr('stroke-width', 1.5);
					mapGroup
						.append('circle')
						.attr('cx', x)
						.attr('cy', y)
						.attr('r', 10)
						.attr('fill', 'transparent')
						.attr('class', 'hotspot-hit')
						.on('mouseenter', (event: MouseEvent) => showTooltip(event, `◎ ${cl.desc}`, '#aa44ff'))
						.on('mousemove', moveTooltip)
						.on('mouseleave', hideTooltip);
				}
			});

			// Draw nuclear sites
			NUCLEAR_SITES.forEach((ns) => {
				const [x, y] = projection([ns.lon, ns.lat]) || [0, 0];
				if (x && y) {
					mapGroup
						.append('circle')
						.attr('cx', x)
						.attr('cy', y)
						.attr('r', 2)
						.attr('fill', '#ffff00');
					mapGroup
						.append('circle')
						.attr('cx', x)
						.attr('cy', y)
						.attr('r', 5)
						.attr('fill', 'none')
						.attr('stroke', '#ffff00')
						.attr('stroke-width', 1)
						.attr('stroke-dasharray', '3,3');
					mapGroup
						.append('circle')
						.attr('cx', x)
						.attr('cy', y)
						.attr('r', 10)
						.attr('fill', 'transparent')
						.attr('class', 'hotspot-hit')
						.on('mouseenter', (event: MouseEvent) => showTooltip(event, `☢ ${ns.desc}`, '#ffff00'))
						.on('mousemove', moveTooltip)
						.on('mouseleave', hideTooltip);
				}
			});

			// Draw military bases
			MILITARY_BASES.forEach((mb) => {
				const [x, y] = projection([mb.lon, mb.lat]) || [0, 0];
				if (x && y) {
					const starPath = `M${x},${y - 5} L${x + 1.5},${y - 1.5} L${x + 5},${y - 1.5} L${x + 2.5},${y + 1} L${x + 3.5},${y + 5} L${x},${y + 2.5} L${x - 3.5},${y + 5} L${x - 2.5},${y + 1} L${x - 5},${y - 1.5} L${x - 1.5},${y - 1.5} Z`;
					mapGroup.append('path').attr('d', starPath).attr('fill', '#ff00ff').attr('opacity', 0.8);
					mapGroup
						.append('circle')
						.attr('cx', x)
						.attr('cy', y)
						.attr('r', 10)
						.attr('fill', 'transparent')
						.attr('class', 'hotspot-hit')
						.on('mouseenter', (event: MouseEvent) => showTooltip(event, `★ ${mb.desc}`, '#ff00ff'))
						.on('mousemove', moveTooltip)
						.on('mouseleave', hideTooltip);
				}
			});

			// Draw hotspots
			drawHotspots();

			// Draw custom monitors with locations
			drawMonitors();

			// Keep weather overlay layer on top and render if enabled
			if (weatherLayer) {
				weatherLayer.raise();
				if (weatherOverlayEnabled) {
					renderWeatherOverlay();
				}
			}
		} catch (err) {
			console.error('Failed to load map data:', err);
		}
	}

	function drawHotspots(): void {
		if (!hotspotsLayer || !projection) return;

		hotspotsLayer.selectAll('*').remove();

		visibleHotspots.forEach((h) => {
			const [x, y] = projection([h.lon, h.lat]) || [0, 0];
			if (x && y) {
				const color = THREAT_COLORS[h.level as keyof typeof THREAT_COLORS] || '#00ff00';
				// Pulsing circle
				hotspotsLayer
					.append('circle')
					.attr('cx', x)
					.attr('cy', y)
					.attr('r', 6)
					.attr('fill', color)
					.attr('fill-opacity', 0.3)
					.attr('class', 'pulse');
				// Inner dot
				hotspotsLayer.append('circle').attr('cx', x).attr('cy', y).attr('r', 3).attr('fill', color);
				// Label
				hotspotsLayer
					.append('text')
					.attr('x', x + 8)
					.attr('y', y + 3)
					.attr('fill', color)
					.attr('font-size', '8px')
					.attr('font-family', 'monospace')
					.text(h.name);
				// Hit area
				hotspotsLayer
					.append('circle')
					.attr('cx', x)
					.attr('cy', y)
					.attr('r', 12)
					.attr('fill', 'transparent')
					.attr('class', 'hotspot-hit')
					.on('mouseenter', (event: MouseEvent) =>
						showEnhancedTooltip(event, h.name, h.lat, h.lon, h.desc, color)
					)
					.on('mousemove', moveTooltip)
					.on('mouseleave', hideTooltip);
			}
		});
	}

	$effect(() => {
		// Re-draw hotspots when filter changes or map initializes
		const _ = visibleHotspots; // dependency
		if (hotspotsLayer && projection) {
			drawHotspots();
		}
	});

	// Draw custom monitor locations
	function drawMonitors(): void {
		if (!mapGroup || !projection) return;

		// Remove existing monitor markers
		mapGroup.selectAll('.monitor-marker').remove();

		monitors
			.filter((m) => m.enabled && m.location)
			.forEach((m) => {
				if (!m.location) return;
				const [x, y] = projection([m.location.lon, m.location.lat]) || [0, 0];
				if (x && y) {
					const color = m.color || '#00ffff';
					mapGroup
						.append('circle')
						.attr('class', 'monitor-marker')
						.attr('cx', x)
						.attr('cy', y)
						.attr('r', 5)
						.attr('fill', color)
						.attr('fill-opacity', 0.6)
						.attr('stroke', color)
						.attr('stroke-width', 2);
					mapGroup
						.append('text')
						.attr('class', 'monitor-marker')
						.attr('x', x + 8)
						.attr('y', y + 3)
						.attr('fill', color)
						.attr('font-size', '8px')
						.attr('font-family', 'monospace')
						.text(m.name);
					mapGroup
						.append('circle')
						.attr('class', 'monitor-marker')
						.attr('cx', x)
						.attr('cy', y)
						.attr('r', 10)
						.attr('fill', 'transparent')
						.on('mouseenter', (event: MouseEvent) =>
							showTooltip(event, `📡 ${m.name}`, color, [
								m.location?.name || '',
								m.keywords.join(', ')
							])
						)
						.on('mousemove', moveTooltip)
						.on('mouseleave', hideTooltip);
				}
			});
	}

	// Zoom controls
	function zoomIn(): void {
		if (!svg || !zoom) return;
		svg.transition().duration(300).call(zoom.scaleBy, 1.5);
	}

	function zoomOut(): void {
		if (!svg || !zoom) return;
		svg
			.transition()
			.duration(300)
			.call(zoom.scaleBy, 1 / 1.5);
	}

	function resetZoom(): void {
		if (!svg || !zoom || !d3Module) return;
		svg.transition().duration(300).call(zoom.transform, d3Module.zoomIdentity);
	}

	// Reactively update monitors when they change
	$effect(() => {
		// Track monitors changes
		const _monitorsRef = monitors;
		if (_monitorsRef && mapGroup && projection) {
			drawMonitors();
		}
	});

	onMount(() => {
		let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

		if (browser) {
			weatherOverlayEnabled = localStorage.getItem(OVERLAY_STORAGE_KEY) === '1';

			// Keyboard shortcuts
			keydownHandler = (e: KeyboardEvent) => {
				// Escape to close selection/search
				if (e.key === 'Escape') {
					if (selectedHotspot) {
						clearSelection();
					}
					if (searchOpen) {
						searchOpen = false;
						searchQuery = '';
					}
				}
				// R to reset view
				if (e.key === 'r' && !e.metaKey && !e.ctrlKey && document.activeElement?.tagName !== 'INPUT') {
					resetZoom();
				}
				// W to toggle weather
				if (e.key === 'w' && !e.metaKey && !e.ctrlKey && document.activeElement?.tagName !== 'INPUT') {
					toggleWeatherOverlay();
				}
				// / to focus search
				if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
					e.preventDefault();
					const searchInput = document.querySelector('.search-input') as HTMLInputElement;
					searchInput?.focus();
				}
			};
			window.addEventListener('keydown', keydownHandler);
		}

		initMap();
		refreshWeatherSnapshots();
		weatherTimer = window.setInterval(refreshWeatherSnapshots, 5 * 60 * 1000);

		// Cleanup
		return () => {
			if (keydownHandler) {
				window.removeEventListener('keydown', keydownHandler);
			}
		};
	});

	onDestroy(() => {
		if (weatherTimer) {
			clearInterval(weatherTimer);
		}
	});
</script>

<Panel id="map" title="Global Situation" {loading} {error}>
	<div class="map-shell">
		<!-- Top Controls Bar -->
		<div class="map-topbar">
			<div class="topbar-left">
				<div class="search-container">
					<input
						type="text"
						class="search-input"
						placeholder="Search cities, regions..."
						bind:value={searchQuery}
						onfocus={() => (searchOpen = true)}
					/>
					{#if searchOpen && searchQuery.length > 0}
						<div class="search-dropdown">
							{#each filteredHotspots as hotspot}
								<button
									class="search-result"
									onclick={() => handleSearchSelect(hotspot)}
								>
									<span class="search-name">{hotspot.name}</span>
									<span class="search-level" style="color: {THREAT_COLORS[hotspot.level]}">{hotspot.level.toUpperCase()}</span>
								</button>
							{/each}
							{#if filteredHotspots.length === 0}
								<div class="search-empty">No locations found</div>
							{/if}
						</div>
					{/if}
				</div>
				<div class="chip-row">
					<span class="chip">{HOTSPOTS.length} locations</span>
					<span class="chip">{criticalSituations.length} critical</span>
				</div>
			</div>
			<div class="topbar-actions">
				<button class="pill-btn" class:active={showCities} onclick={() => showCities = !showCities}>
					{showCities ? '🏙️' : '🚫'} Cities {showCities ? 'ON' : 'OFF'}
				</button>
				<div class="filter-dropdown">
					<button class="pill-btn" class:active={filterMenuOpen} onclick={() => filterMenuOpen = !filterMenuOpen}>
						🎛️ Filters
					</button>
					{#if filterMenuOpen}
						<div class="filter-menu">
							<div class="filter-section">
								<div class="filter-label">Min Population (M)</div>
								<input type="range" min="0" max="5" step="0.25" bind:value={minPopulation} class="filter-slider" />
								<span class="filter-value">{minPopulation.toFixed(2)}M</span>
							</div>
							<div class="filter-section">
								<div class="filter-label">Min Threat Score</div>
								<input type="range" min="0" max="100" step="5" bind:value={minThreatScore} class="filter-slider" />
								<span class="filter-value">{minThreatScore}</span>
							</div>
							<div class="filter-section">
								<div class="filter-label">Regions</div>
								<div class="filter-chips">
									<button class="filter-chip" class:active={selectedRegions.has('all')} onclick={() => toggleRegion('all')}>All</button>
									<button class="filter-chip" class:active={selectedRegions.has('Asia')} onclick={() => toggleRegion('Asia')}>Asia</button>
									<button class="filter-chip" class:active={selectedRegions.has('Europe')} onclick={() => toggleRegion('Europe')}>Europe</button>
									<button class="filter-chip" class:active={selectedRegions.has('Middle East')} onclick={() => toggleRegion('Middle East')}>Middle East</button>
									<button class="filter-chip" class:active={selectedRegions.has('Africa')} onclick={() => toggleRegion('Africa')}>Africa</button>
									<button class="filter-chip" class:active={selectedRegions.has('N. America')} onclick={() => toggleRegion('N. America')}>N. America</button>
									<button class="filter-chip" class:active={selectedRegions.has('S. America')} onclick={() => toggleRegion('S. America')}>S. America</button>
									<button class="filter-chip" class:active={selectedRegions.has('Oceania')} onclick={() => toggleRegion('Oceania')}>Oceania</button>
								</div>
							</div>
							<div class="filter-section">
								<div class="filter-label">Threat Levels</div>
								<div class="filter-chips">
									<button class="filter-chip" class:active={selectedLevels.has('all')} onclick={() => toggleLevel('all')}>All</button>
									<button class="filter-chip critical" class:active={selectedLevels.has('critical')} onclick={() => toggleLevel('critical')}>Critical</button>
									<button class="filter-chip high" class:active={selectedLevels.has('high')} onclick={() => toggleLevel('high')}>High</button>
									<button class="filter-chip elevated" class:active={selectedLevels.has('elevated')} onclick={() => toggleLevel('elevated')}>Elevated</button>
									<button class="filter-chip low" class:active={selectedLevels.has('low')} onclick={() => toggleLevel('low')}>Low</button>
								</div>
							</div>
							<div class="filter-stats">
								Showing {visibleHotspots.length} of {allCitiesWithScores.length} cities
							</div>
						</div>
					{/if}
				</div>
				<div class="region-btns">
					{#each FOCUS_TARGETS as target}
						<button class="region-btn" onclick={() => focusTarget(target.label)}>
							{target.label}
						</button>
					{/each}
				</div>
				<button class="pill-btn" class:active={weatherOverlayEnabled} onclick={toggleWeatherOverlay}>
					🌤️ Weather
				</button>
				<button class="pill-btn" onclick={resetZoom}>⟲ Reset</button>
			</div>
		</div>

		<!-- Main Map Area -->
		<div class="map-main">
			<!-- Critical Situations Sidebar -->
			<div class="situations-sidebar">
				<div class="sidebar-header">
					<span class="sidebar-title">🚨 Emergent Situations</span>
				</div>
				<div class="situations-list">
					{#each criticalSituations.slice(0, 8) as situation}
						{@const score = situation.emergentScore}
						<button class="situation-card" onclick={() => focusHotspot(situation)}>
							<div class="situation-header">
								<span class="situation-name">{situation.name}</span>
								<span class="situation-score" style="background: {getEmergentColor(score)}">
									{score}
								</span>
							</div>
							<div class="situation-label" style="color: {getEmergentColor(score)}">
								{getEmergentLabel(score)}
							</div>
							<div class="situation-bar">
								<div class="situation-fill" style="width: {score}%; background: {getEmergentColor(score)}"></div>
							</div>
						</button>
					{/each}
				</div>
			</div>

			<!-- Map Container -->
			<div class="map-body" bind:this={mapContainer}>
				<svg class="map-svg"></svg>
				<div class="rain-overlay" class:active={weatherOverlayEnabled}></div>
				{#if tooltipVisible && tooltipContent}
					<div
						class="map-tooltip"
						style="left: {tooltipPosition.left}px; top: {tooltipPosition.top}px;"
					>
						<strong style="color: {tooltipContent.color}">{tooltipContent.title}</strong>
						{#each tooltipContent.lines as line}
							<br /><span class="tooltip-line">{line}</span>
						{/each}
					</div>
				{/if}

				<!-- Zoom Controls -->
				<div class="zoom-controls">
					<button class="zoom-btn" onclick={zoomIn} title="Zoom in">+</button>
					<input
						type="range"
						class="zoom-slider"
						min={MIN_ZOOM}
						max={MAX_ZOOM}
						step="0.1"
						value={currentZoom}
						oninput={handleZoomSlider}
					/>
					<button class="zoom-btn" onclick={zoomOut} title="Zoom out">−</button>
					<span class="zoom-level">{Math.round(currentZoom * 100)}%</span>
				</div>

				<!-- Zoom Hint -->
				<div class="zoom-hint">
					<span class="hint-icon">⌘</span>
					<span class="hint-text">+ scroll to zoom</span>
				</div>

				<!-- Legend -->
				<div class="map-legend">
					<div class="legend-title">Emergent Score</div>
					<div class="legend-item">
						<span class="legend-dot critical"></span> Critical (85-100)
					</div>
					<div class="legend-item">
						<span class="legend-dot high"></span> High (60-84)
					</div>
					<div class="legend-item">
						<span class="legend-dot elevated"></span> Elevated (35-59)
					</div>
					<div class="legend-item">
						<span class="legend-dot low"></span> Stable (1-34)
					</div>
					<div class="legend-note">Click any marker for details</div>
				</div>

				<!-- Selected Location Info -->
				{#if selectedHotspot && selectedBreakdown}
					<div class="selected-info expanded">
						<button class="selected-close" onclick={clearSelection}>×</button>
						<div class="selected-header">
							<span class="selected-name">{selectedHotspot.name}</span>
							<span class="selected-score" style="background: {getEmergentColor(selectedBreakdown.finalScore)}">
								{selectedBreakdown.finalScore}
							</span>
						</div>
						<div class="selected-label" style="color: {getEmergentColor(selectedBreakdown.finalScore)}">
							{getEmergentLabel(selectedBreakdown.finalScore)}
						</div>
						<p class="selected-desc">{selectedHotspot.desc}</p>
						
						<!-- Score Breakdown -->
						<div class="score-breakdown">
							<div class="breakdown-title">Score Analysis</div>
							<div class="breakdown-row">
								<span>Base Score</span>
								<span class="breakdown-value">{selectedBreakdown.baseScore}</span>
							</div>
							<div class="breakdown-row">
								<span>Volatility</span>
								<span class="breakdown-value" class:positive={selectedBreakdown.volatilityModifier > 0} class:negative={selectedBreakdown.volatilityModifier < 0}>
									{selectedBreakdown.volatilityModifier > 0 ? '+' : ''}{selectedBreakdown.volatilityModifier}
								</span>
							</div>
							<div class="breakdown-row total">
								<span>Final Score</span>
								<span class="breakdown-value">{selectedBreakdown.finalScore}</span>
							</div>
						</div>

						<!-- Contributing Factors -->
						{#if selectedBreakdown.factors.length > 0}
							<div class="factors-section">
								<div class="factors-title">Contributing Factors</div>
								{#each selectedBreakdown.factors as factor}
									<div class="factor-item" class:negative={factor.impact === 'negative'} class:positive={factor.impact === 'positive'}>
										<span class="factor-name">{factor.name}</span>
										<span class="factor-weight">{factor.weight > 0 ? '+' : ''}{factor.weight}</span>
									</div>
								{/each}
							</div>
						{/if}

						<!-- Reasons List -->
						{#if selectedHotspot.reasons && selectedHotspot.reasons.length > 0}
							<div class="reasons-section">
								<div class="reasons-title">Key Factors</div>
								<ul class="reasons-list">
									{#each selectedHotspot.reasons as reason}
										<li>{reason}</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Weather Tracker Footer -->
		{#if weatherOverlayEnabled}
			<div class="weather-tracker">
				<div class="weather-header">
					<div>
						<div class="weather-title">Live Weather</div>
					</div>
					<span class="weather-timestamp">
						{weatherUpdatedAt ? `Updated ${weatherUpdatedAt}` : 'Syncing...'}
					</span>
				</div>
				<div class="weather-grid">
					{#each WEATHER_WATCH as loc}
						<button class="weather-card" onclick={() => focusHotspot(loc)}>
							<div class="weather-city">{loc.name}</div>
							<div class="weather-metric">
								{weatherSnapshots[loc.name]?.temp ?? '—'}°F
							</div>
							<div class="weather-meta">
								{weatherSnapshots[loc.name]?.condition ?? 'Fetching...'}
							</div>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</Panel>

<style>
	.map-shell {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: linear-gradient(145deg, #0b1310, #0c1a16);
		border: 1px solid #132420;
		border-radius: 6px;
		padding: 0.5rem;
	}

	.map-topbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		padding: 0.35rem;
	}

	.topbar-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	/* Search */
	.search-container {
		position: relative;
	}

	.search-input {
		background: rgba(20, 35, 30, 0.9);
		border: 1px solid #1f3c34;
		border-radius: 999px;
		padding: 0.4rem 0.75rem;
		font-size: 0.72rem;
		color: #e8f7f0;
		width: 180px;
		transition: all 0.2s ease;
	}

	.search-input::placeholder {
		color: #6b9c8a;
	}

	.search-input:focus {
		outline: none;
		border-color: #46bea7;
		box-shadow: 0 0 0 2px rgba(70, 190, 167, 0.2);
		width: 220px;
	}

	.search-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		margin-top: 0.25rem;
		background: rgba(10, 18, 14, 0.98);
		border: 1px solid #1f3c34;
		border-radius: 8px;
		max-height: 240px;
		overflow-y: auto;
		z-index: 200;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
	}

	.search-result {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0.75rem;
		width: 100%;
		background: none;
		border: none;
		color: #e8f7f0;
		font-size: 0.7rem;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.search-result:hover {
		background: rgba(70, 190, 167, 0.15);
	}

	.search-name {
		font-weight: 500;
	}

	.search-level {
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.search-empty {
		padding: 0.75rem;
		text-align: center;
		color: #6b9c8a;
		font-size: 0.68rem;
	}

	.chip-row {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.chip {
		background: rgba(122, 196, 173, 0.1);
		border: 1px solid rgba(122, 196, 173, 0.4);
		color: #ccefe0;
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
		font-size: 0.65rem;
		line-height: 1;
	}

	.topbar-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.region-btns {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	.region-btn {
		background: rgba(18, 46, 40, 0.5);
		border: 1px solid #1f3c34;
		color: #b9d8cc;
		padding: 0.3rem 0.55rem;
		border-radius: 4px;
		font-size: 0.62rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.region-btn:hover {
		background: rgba(33, 70, 60, 0.8);
		border-color: #46bea7;
		color: #fff;
	}

	.pill-btn {
		background: rgba(18, 46, 40, 0.8);
		border: 1px solid #1f3c34;
		color: #dff4eb;
		padding: 0.35rem 0.7rem;
		border-radius: 999px;
		font-size: 0.7rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.pill-btn:hover,
	.pill-btn.active {
		background: linear-gradient(135deg, #1c6f59, #158d7a);
		border-color: #46bea7;
		color: #f3fffb;
		box-shadow: 0 0 0 1px rgba(70, 190, 167, 0.3);
	}

	/* Main Layout */
	.map-main {
		display: flex;
		gap: 0.5rem;
		min-height: 400px;
	}

	/* Situations Sidebar */
	.situations-sidebar {
		width: 200px;
		flex-shrink: 0;
		background: rgba(8, 14, 12, 0.6);
		border: 1px solid #15322c;
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.sidebar-header {
		padding: 0.5rem 0.6rem;
		border-bottom: 1px solid #15322c;
		background: rgba(15, 25, 22, 0.5);
	}

	.sidebar-title {
		font-size: 0.72rem;
		color: #eaf7f0;
		font-weight: 500;
	}

	.situations-list {
		flex: 1;
		overflow-y: auto;
		padding: 0.35rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.situation-card {
		background: rgba(18, 28, 24, 0.8);
		border: 1px solid #1f3c34;
		border-radius: 5px;
		padding: 0.45rem 0.55rem;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		width: 100%;
	}

	.situation-card:hover {
		background: rgba(30, 50, 44, 0.9);
		border-color: #46bea7;
		transform: translateX(2px);
	}

	.situation-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.35rem;
	}

	.situation-name {
		font-size: 0.68rem;
		color: #e8f7f0;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.situation-score {
		font-size: 0.6rem;
		font-weight: 700;
		padding: 0.15rem 0.35rem;
		border-radius: 3px;
		color: #000;
	}

	.situation-label {
		font-size: 0.55rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: 0.15rem;
	}

	.situation-bar {
		height: 3px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		margin-top: 0.35rem;
		overflow: hidden;
	}

	.situation-fill {
		height: 100%;
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	/* Map Body */
	.map-body {
		flex: 1;
		position: relative;
		background: radial-gradient(circle at 30% 20%, rgba(19, 60, 50, 0.35), transparent 40%),
			radial-gradient(circle at 70% 70%, rgba(30, 90, 80, 0.25), transparent 45%),
			#0a0f0d;
		border: 1px solid #15322c;
		border-radius: 6px;
		overflow: hidden;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
	}

	.rain-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: radial-gradient(circle at 40% 20%, rgba(0, 120, 255, 0.08), transparent 45%),
			radial-gradient(circle at 70% 70%, rgba(0, 90, 180, 0.08), transparent 50%),
			repeating-linear-gradient(
				110deg,
				rgba(0, 180, 255, 0.15) 0px,
				transparent 2px,
				transparent 6px
			),
			repeating-linear-gradient(
				130deg,
				rgba(0, 140, 255, 0.08) 0px,
				transparent 1px,
				transparent 4px
			);
		mix-blend-mode: screen;
		opacity: 0;
		filter: blur(0.3px);
		animation: rain-shift 12s linear infinite;
		transition: opacity 0.3s ease;
	}

	.rain-overlay.active {
		opacity: 0.45;
	}

	@keyframes rain-shift {
		0% {
			transform: translate3d(-8%, -8%, 0) scale(1.02);
		}
		100% {
			transform: translate3d(15%, 20%, 0) scale(1.08);
		}
	}

	.map-svg {
		width: 100%;
		height: 100%;
	}

	.map-tooltip {
		position: absolute;
		background: rgba(6, 10, 9, 0.96);
		border: 1px solid #2c4f45;
		border-radius: 6px;
		padding: 0.55rem;
		font-size: 0.68rem;
		color: #e8f7f0;
		max-width: 260px;
		pointer-events: none;
		z-index: 100;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
	}

	.tooltip-line {
		opacity: 0.8;
	}

	/* Zoom Controls */
	.zoom-controls {
		position: absolute;
		bottom: 0.75rem;
		left: 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		z-index: 10;
		background: rgba(10, 16, 14, 0.9);
		padding: 0.35rem;
		border-radius: 6px;
		border: 1px solid #1f3c34;
		backdrop-filter: blur(6px);
	}

	.zoom-btn {
		width: 1.8rem;
		height: 1.8rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(18, 30, 26, 0.9);
		border: 1px solid #1f3c34;
		border-radius: 4px;
		color: #dff4eb;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.zoom-btn:hover {
		background: rgba(33, 70, 60, 0.95);
		color: #fff;
		box-shadow: 0 0 0 1px rgba(70, 190, 167, 0.3);
	}

	.zoom-slider {
		width: 80px;
		height: 4px;
		appearance: none;
		background: rgba(70, 190, 167, 0.2);
		border-radius: 2px;
		cursor: pointer;
	}

	.zoom-slider::-webkit-slider-thumb {
		appearance: none;
		width: 12px;
		height: 12px;
		background: #46bea7;
		border-radius: 50%;
		cursor: grab;
		transition: transform 0.15s ease;
	}

	.zoom-slider::-webkit-slider-thumb:hover {
		transform: scale(1.2);
	}

	.zoom-level {
		font-size: 0.62rem;
		color: #8bb5a7;
		min-width: 32px;
	}

	/* Zoom Hint */
	.zoom-hint {
		position: absolute;
		top: 0.75rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.3rem;
		background: rgba(10, 16, 14, 0.85);
		padding: 0.3rem 0.6rem;
		border-radius: 4px;
		border: 1px solid #1f3c34;
		font-size: 0.58rem;
		color: #6b9c8a;
		opacity: 0.8;
		transition: opacity 0.2s ease;
	}

	.zoom-hint:hover {
		opacity: 1;
	}

	.hint-icon {
		font-size: 0.7rem;
		background: rgba(70, 190, 167, 0.2);
		padding: 0.1rem 0.25rem;
		border-radius: 2px;
	}

	/* Legend */
	.map-legend {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		background: rgba(10, 14, 12, 0.9);
		padding: 0.5rem 0.65rem;
		border-radius: 6px;
		font-size: 0.58rem;
		border: 1px solid #1f3c34;
		backdrop-filter: blur(6px);
	}

	.legend-title {
		font-size: 0.62rem;
		font-weight: 600;
		color: #e8f7f0;
		margin-bottom: 0.15rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: #b8c4bf;
	}

	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.legend-dot.critical {
		background: #ff2222;
		box-shadow: 0 0 6px rgba(255, 34, 34, 0.5);
	}

	.legend-dot.high {
		background: #ff6644;
	}

	.legend-dot.elevated {
		background: #ffcc00;
	}

	.legend-dot.low {
		background: #00ff88;
	}

	.legend-note {
		font-size: 0.52rem;
		color: #6b9c8a;
		margin-top: 0.3rem;
		padding-top: 0.25rem;
		border-top: 1px dashed #1f3c34;
	}

	/* Selected Info */
	.selected-info {
		position: absolute;
		bottom: 0.75rem;
		right: 0.75rem;
		width: 220px;
		background: rgba(8, 14, 12, 0.95);
		border: 1px solid #2c4f45;
		border-radius: 6px;
		padding: 0.65rem;
		z-index: 50;
		backdrop-filter: blur(8px);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
	}

	.selected-close {
		position: absolute;
		top: 0.35rem;
		right: 0.35rem;
		background: none;
		border: none;
		color: #6b9c8a;
		font-size: 1rem;
		cursor: pointer;
		line-height: 1;
	}

	.selected-close:hover {
		color: #fff;
	}

	.selected-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.selected-name {
		font-size: 0.78rem;
		font-weight: 600;
		color: #e8f7f0;
	}

	.selected-score {
		font-size: 0.6rem;
		font-weight: 700;
		padding: 0.15rem 0.35rem;
		border-radius: 3px;
		color: #000;
	}

	.selected-label {
		font-size: 0.55rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: 0.15rem;
		font-weight: 600;
	}

	.selected-desc {
		font-size: 0.65rem;
		color: #9fb6ad;
		margin: 0.4rem 0 0;
		line-height: 1.4;
	}

	.selected-info.expanded {
		width: 280px;
		max-height: 400px;
		overflow-y: auto;
	}

	/* Score Breakdown */
	.score-breakdown {
		margin-top: 0.6rem;
		padding-top: 0.5rem;
		border-top: 1px solid #1f3c34;
	}

	.breakdown-title,
	.factors-title,
	.reasons-title {
		font-size: 0.58rem;
		color: #8ad1bd;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.3rem;
	}

	.breakdown-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.62rem;
		color: #9fb6ad;
		padding: 0.15rem 0;
	}

	.breakdown-row.total {
		border-top: 1px dashed #1f3c34;
		margin-top: 0.2rem;
		padding-top: 0.3rem;
		font-weight: 600;
		color: #e8f7f0;
	}

	.breakdown-value {
		font-weight: 600;
	}

	.breakdown-value.positive {
		color: #ff6644;
	}

	.breakdown-value.negative {
		color: #00ff88;
	}

	/* Contributing Factors */
	.factors-section {
		margin-top: 0.5rem;
		padding-top: 0.4rem;
		border-top: 1px solid #1f3c34;
	}

	.factor-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.58rem;
		padding: 0.2rem 0.3rem;
		margin: 0.15rem 0;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.03);
	}

	.factor-item.negative {
		border-left: 2px solid #ff6644;
	}

	.factor-item.positive {
		border-left: 2px solid #00ff88;
	}

	.factor-name {
		color: #b8c4bf;
	}

	.factor-weight {
		font-weight: 600;
		color: #8ad1bd;
	}

	.factor-item.negative .factor-weight {
		color: #ff8866;
	}

	.factor-item.positive .factor-weight {
		color: #66ffaa;
	}

	/* Reasons Section */
	.reasons-section {
		margin-top: 0.5rem;
		padding-top: 0.4rem;
		border-top: 1px solid #1f3c34;
	}

	.reasons-list {
		margin: 0;
		padding-left: 1rem;
		list-style: disc;
	}

	.reasons-list li {
		font-size: 0.58rem;
		color: #9fb6ad;
		line-height: 1.5;
		margin: 0.15rem 0;
	}

	/* Weather Tracker */
	.weather-tracker {
		background: rgba(8, 14, 12, 0.85);
		border: 1px solid #12372f;
		border-radius: 6px;
		padding: 0.5rem;
		backdrop-filter: blur(8px);
	}

	.weather-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.4rem;
	}

	.weather-title {
		font-size: 0.72rem;
		color: #eaf7f0;
		font-weight: 500;
	}

	.weather-timestamp {
		font-size: 0.58rem;
		color: #6b9c8a;
	}

	.weather-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
		gap: 0.35rem;
	}

	.weather-card {
		background: rgba(20, 30, 26, 0.8);
		border: 1px solid #1f3c34;
		border-radius: 4px;
		padding: 0.4rem;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.weather-card:hover {
		background: rgba(30, 50, 44, 0.9);
		border-color: #46bea7;
	}

	.weather-city {
		font-size: 0.65rem;
		color: #8ad1bd;
		margin-bottom: 0.1rem;
	}

	.weather-metric {
		font-size: 0.95rem;
		font-weight: 600;
		color: #eaf7ff;
		line-height: 1.1;
	}

	.weather-meta {
		font-size: 0.58rem;
		color: #7a9c90;
	}

	/* Filter Dropdown */
	.filter-dropdown {
		position: relative;
	}

	.filter-menu {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		background: rgba(10, 16, 14, 0.98);
		border: 1px solid #2c4f45;
		border-radius: 8px;
		padding: 1rem;
		min-width: 320px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 100;
		backdrop-filter: blur(12px);
	}

	.filter-section {
		margin-bottom: 1rem;
	}

	.filter-section:last-child {
		margin-bottom: 0;
	}

	.filter-label {
		font-size: 0.7rem;
		color: #8ad1bd;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.5rem;
		font-weight: 600;
	}

	.filter-slider {
		width: 100%;
		height: 4px;
		appearance: none;
		background: rgba(70, 190, 167, 0.2);
		border-radius: 2px;
		cursor: pointer;
		margin-bottom: 0.25rem;
	}

	.filter-slider::-webkit-slider-thumb {
		appearance: none;
		width: 14px;
		height: 14px;
		background: #46bea7;
		border-radius: 50%;
		cursor: grab;
		transition: transform 0.15s ease;
	}

	.filter-slider::-webkit-slider-thumb:hover {
		transform: scale(1.2);
	}

	.filter-value {
		display: inline-block;
		font-size: 0.7rem;
		color: #e8f7f0;
		background: rgba(70, 190, 167, 0.15);
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
		font-weight: 600;
	}

	.filter-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.filter-chip {
		padding: 0.35rem 0.65rem;
		font-size: 0.65rem;
		border: 1px solid #1f3c34;
		border-radius: 4px;
		background: rgba(18, 30, 26, 0.7);
		color: #9fb6ad;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.filter-chip:hover {
		background: rgba(33, 70, 60, 0.8);
		border-color: #2c4f45;
	}

	.filter-chip.active {
		background: rgba(70, 190, 167, 0.25);
		border-color: #46bea7;
		color: #e8f7f0;
	}

	.filter-chip.critical.active {
		background: rgba(255, 34, 34, 0.25);
		border-color: #ff2222;
		color: #ff8866;
	}

	.filter-chip.high.active {
		background: rgba(255, 68, 68, 0.25);
		border-color: #ff4444;
		color: #ff8866;
	}

	.filter-chip.elevated.active {
		background: rgba(255, 204, 0, 0.25);
		border-color: #ffcc00;
		color: #ffdd66;
	}

	.filter-chip.low.active {
		background: rgba(0, 255, 136, 0.25);
		border-color: #00ff88;
		color: #66ffaa;
	}

	.filter-stats {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid #1f3c34;
		font-size: 0.7rem;
		color: #8bb5a7;
		text-align: center;
		font-weight: 600;
	}

	/* Pulse animation for hotspots */
	:global(.pulse) {
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			r: 6;
			opacity: 0.3;
		}
		50% {
			r: 10;
			opacity: 0.1;
		}
	}

	:global(.hotspot-hit) {
		cursor: pointer;
	}

	@media (max-width: 900px) {
		.map-main {
			flex-direction: column;
		}

		.situations-sidebar {
			width: 100%;
			max-height: 150px;
		}

		.map-body {
			min-height: 300px;
		}

		.zoom-controls {
			bottom: 0.5rem;
			left: 0.5rem;
		}

		.map-legend {
			top: 0.5rem;
			right: 0.5rem;
		}

		.selected-info {
			bottom: 3.5rem;
			right: 0.5rem;
			width: 180px;
		}

		.search-input {
			width: 140px;
		}

		.region-btns {
			display: none;
		}
	}
</style>
