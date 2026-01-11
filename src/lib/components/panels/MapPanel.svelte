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
		getEmergentColor,
		getEmergentLabel
	} from '$lib/config/map';
	import { CACHE_TTLS } from '$lib/config/api';
	import type { CustomMonitor } from '$lib/types';
	import type { Hotspot } from '$lib/config/map';

	interface Props {
		monitors?: CustomMonitor[];
		loading?: boolean;
		error?: string | null;
	}

	let { monitors = [], loading = false, error = null }: Props = $props();

	let mapContainer: HTMLDivElement;
	// D3 objects - initialized in initMap, null before initialization
	// Using 'any' for D3 objects as they're dynamically imported and have complex generic types
	/* eslint-disable @typescript-eslint/no-explicit-any */
	let d3Module: typeof import('d3') | null = null;
	let svg: any = null;
	let mapGroup: any = null;
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

	// Zoom level state
	let currentZoom = $state(1);
	const MIN_ZOOM = 1;
	const MAX_ZOOM = 6;

	// Filtered hotspots for search
	const filteredHotspots = $derived(
		searchQuery.trim()
			? HOTSPOTS.filter(
					(h) =>
						h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
						h.desc.toLowerCase().includes(searchQuery.toLowerCase())
				)
			: HOTSPOTS.slice(0, 10)
	);

	// Compute emergent scores for all hotspots
	const hotspotsWithScores = $derived(
		HOTSPOTS.map((h) => ({
			...h,
			emergentScore: h.emergentScore ?? calculateEmergentScore(h.level, Math.random() * 0.3 + 0.35)
		}))
	);

	// Critical situations (score >= 70)
	const criticalSituations = $derived(
		hotspotsWithScores.filter((h) => h.emergentScore >= 70).sort((a, b) => b.emergentScore - a.emergentScore)
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
	const WEATHER_WATCH: Hotspot[] = WEATHER_WATCH_NAMES.map((name) =>
		HOTSPOTS.find((h) => h.name === name)
	).filter(Boolean) as Hotspot[];

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
	let weatherLayer: any = null;
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
		searchOpen = false;
		searchQuery = '';
		focusOn(hotspot.lon, hotspot.lat, 3.5);
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

	// Build enhanced tooltip with weather
	async function showEnhancedTooltip(
		event: MouseEvent,
		_name: string,
		lat: number,
		lon: number,
		desc: string,
		color: string
	): Promise<void> {
		const localTime = getLocalTime(lon);
		const lines = [`🕐 Local: ${localTime}`];
		showTooltip(event, desc, color, lines);

		// Fetch weather asynchronously
		const weather = await getWeather(lat, lon);
		if (weather && tooltipVisible) {
			tooltipContent = {
				title: desc,
				color,
				lines: [
					`🕐 Local: ${localTime}`,
					`${weather.condition} ${weather.temp}°F, ${weather.wind}mph`
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
		weatherLayer = mapGroup.append('g').attr('id', 'weatherLayer');

		// Setup zoom - disable scroll wheel, allow touch pinch and buttons
		zoom = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([MIN_ZOOM, MAX_ZOOM])
			.filter((event) => {
				// Block scroll wheel zoom (wheel events)
				if (event.type === 'wheel') return false;
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
			HOTSPOTS.forEach((h) => {
				const [x, y] = projection([h.lon, h.lat]) || [0, 0];
				if (x && y) {
					const color = THREAT_COLORS[h.level];
					// Pulsing circle
					mapGroup
						.append('circle')
						.attr('cx', x)
						.attr('cy', y)
						.attr('r', 6)
						.attr('fill', color)
						.attr('fill-opacity', 0.3)
						.attr('class', 'pulse');
					// Inner dot
					mapGroup.append('circle').attr('cx', x).attr('cy', y).attr('r', 3).attr('fill', color);
					// Label
					mapGroup
						.append('text')
						.attr('x', x + 8)
						.attr('y', y + 3)
						.attr('fill', color)
						.attr('font-size', '8px')
						.attr('font-family', 'monospace')
						.text(h.name);
					// Hit area
					mapGroup
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
		if (browser) {
			weatherOverlayEnabled = localStorage.getItem(OVERLAY_STORAGE_KEY) === '1';
		}
		initMap();
		refreshWeatherSnapshots();
		weatherTimer = window.setInterval(refreshWeatherSnapshots, 5 * 60 * 1000);
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

				<!-- Legend -->
				<div class="map-legend">
					<div class="legend-title">Threat Level</div>
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
				</div>

				<!-- Selected Location Info -->
				{#if selectedHotspot}
					{@const score = calculateEmergentScore(selectedHotspot.level, 0.5)}
					<div class="selected-info">
						<button class="selected-close" onclick={() => (selectedHotspot = null)}>×</button>
						<div class="selected-header">
							<span class="selected-name">{selectedHotspot.name}</span>
							<span class="selected-score" style="background: {getEmergentColor(score)}">{score}</span>
						</div>
						<p class="selected-desc">{selectedHotspot.desc}</p>
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
						{weatherUpdatedAt ? `Updated ${weatherUpdatedAt}` : 'Syncing...'}
					</span>
				</div>
				<div class="weather-grid">
					{#each WEATHER_WATCH as loc}
						<div class="weather-card">
							<div class="weather-city">{loc.name}</div>
							<div class="weather-metric">
								{weatherSnapshots[loc.name]?.temp ?? '—'}°F
							</div>
							<div class="weather-meta">
								{weatherSnapshots[loc.name]?.condition ?? 'Fetching...'}
								{#if weatherSnapshots[loc.name]?.wind}
									• {weatherSnapshots[loc.name]?.wind} mph
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div class="zoom-controls">
				<button class="zoom-btn" onclick={zoomIn} title="Zoom in">+</button>
				<button class="zoom-btn" onclick={zoomOut} title="Zoom out">−</button>
			</div>
		</div>
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
	}

	.map-eyebrow {
		margin: 0 0 0.25rem 0;
		color: #7ac4ad;
		font-size: 0.65rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
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

	.chip.weather.active {
		background: rgba(0, 180, 255, 0.1);
		border-color: rgba(0, 180, 255, 0.6);
		color: #bde9ff;
	}

	.topbar-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.focus-row {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
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

	.pill-btn.ghost {
		background: rgba(18, 46, 40, 0.35);
		color: #b9d8cc;
	}

	.pill-btn:hover,
	.pill-btn.active {
		background: linear-gradient(135deg, #1c6f59, #158d7a);
		border-color: #46bea7;
		color: #f3fffb;
		box-shadow: 0 0 0 1px rgba(70, 190, 167, 0.3);
	}

	.map-body {
		position: relative;
		width: 100%;
		aspect-ratio: 2 / 1;
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
		background: radial-gradient(circle at 40% 20%, rgba(0, 120, 255, 0.05), transparent 45%),
			radial-gradient(circle at 70% 70%, rgba(0, 90, 180, 0.05), transparent 50%),
			repeating-linear-gradient(
				120deg,
				rgba(0, 180, 255, 0.12) 0px,
				rgba(0, 180, 255, 0.12) 2px,
				transparent 8px,
				transparent 16px
			);
		mix-blend-mode: screen;
		opacity: 0;
		filter: blur(0.5px);
		animation: rain-shift 18s linear infinite;
		transition: opacity 0.3s ease;
	}

	.rain-overlay.active {
		opacity: 0.32;
	}

	@keyframes rain-shift {
		0% {
			transform: translate3d(-5%, -5%, 0) scale(1.02);
		}
		50% {
			transform: translate3d(5%, 8%, 0) scale(1.05);
		}
		100% {
			transform: translate3d(12%, 16%, 0) scale(1.08);
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

	.zoom-controls {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		z-index: 10;
	}

	.zoom-btn {
		width: 2.6rem;
		height: 2.6rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(18, 30, 26, 0.9);
		border: 1px solid #1f3c34;
		border-radius: 8px;
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

	.map-legend {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		background: rgba(10, 14, 12, 0.85);
		padding: 0.4rem 0.6rem;
		border-radius: 6px;
		font-size: 0.6rem;
		border: 1px solid #1f3c34;
		backdrop-filter: blur(6px);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: #b8c4bf;
	}

	.legend-note {
		color: #7aa69a;
		opacity: 0.85;
		margin-top: 0.1rem;
	}

	.legend-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
	}

	.legend-dot.high {
		background: #ff4444;
	}

	.legend-dot.elevated {
		background: #ffcc00;
	}

	.legend-dot.low {
		background: #00ff88;
	}

	.legend-dot.weather-ring {
		background: linear-gradient(135deg, #00c8ff, #ffb400, #ff5050);
	}

	.weather-tracker {
		position: absolute;
		bottom: 0.75rem;
		left: 0.75rem;
		right: 0.75rem;
		background: rgba(8, 12, 10, 0.9);
		border: 1px solid #12372f;
		border-radius: 6px;
		padding: 0.55rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		backdrop-filter: blur(8px);
		box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
		z-index: 5;
	}

	.weather-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.weather-title {
		font-size: 0.78rem;
		color: #eaf7f0;
		margin: 0;
	}

	.weather-sub {
		font-size: 0.62rem;
		color: #8bb5a7;
		margin: 0;
	}

	.weather-timestamp {
		font-size: 0.62rem;
		color: #7ac4ad;
	}

	.weather-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 0.4rem;
	}

	.weather-card {
		background: rgba(20, 30, 26, 0.8);
		border: 1px solid #1f3c34;
		border-radius: 4px;
		padding: 0.4rem;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
	}

	.weather-city {
		font-size: 0.7rem;
		color: #8ad1bd;
		margin-bottom: 0.1rem;
	}

	.weather-metric {
		font-size: 1rem;
		font-weight: 600;
		color: #eaf7ff;
		line-height: 1.1;
	}

	.weather-meta {
		font-size: 0.65rem;
		color: #9fb6ad;
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
		.map-body {
			aspect-ratio: 16 / 10;
		}

		.weather-tracker {
			position: relative;
			bottom: auto;
			left: auto;
			right: auto;
			margin: 0.5rem;
		}

		.zoom-controls {
			top: 0.5rem;
			left: 0.5rem;
		}

		.map-legend {
			top: auto;
			bottom: 0.5rem;
		}
	}
</style>
