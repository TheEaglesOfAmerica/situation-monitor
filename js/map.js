// map.js - Simple D3 world map

import { INTEL_HOTSPOTS, CONFLICT_ZONES, SHIPPING_CHOKEPOINTS } from './constants.js';

let worldMapData = null;

// Load world map data
async function loadWorldMap() {
    if (worldMapData) return worldMapData;
    try {
        const response = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
        worldMapData = await response.json();
        return worldMapData;
    } catch (e) {
        console.error('Failed to load world map:', e);
        return null;
    }
}

// Main render function
export async function renderGlobalMap(activityData = {}, earthquakes = [], allNews = []) {
    const panel = document.getElementById('mapPanel');
    if (!panel) return;

    // Check for D3
    if (typeof d3 === 'undefined') {
        panel.innerHTML = '<div class="loading-msg" style="color: #ff6b6b;">D3 library not loaded</div>';
        return;
    }

    // Set up container
    panel.innerHTML = `
        <div class="world-map" id="worldMapContainer">
            <svg id="worldMapSVG"></svg>
            <div class="map-overlays" id="mapOverlays"></div>
            <div class="map-corner-label tl">GLOBAL ACTIVITY MONITOR</div>
            <div class="map-corner-label tr">OPEN SOURCE</div>
        </div>
    `;

    const container = document.getElementById('worldMapContainer');
    const svg = d3.select('#worldMapSVG');
    const width = container.offsetWidth || 800;
    const height = container.offsetHeight || 500;

    svg.attr('width', '100%')
       .attr('height', '100%')
       .attr('viewBox', `0 0 ${width} ${height}`);

    // Projection
    const projection = d3.geoEquirectangular()
        .scale(width / 6)
        .center([0, 20])
        .translate([width / 2, height / 2]);

    const path = d3.geoPath().projection(projection);

    // Background
    svg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .attr('fill', '#020a08');

    // Grid
    const graticule = d3.geoGraticule().step([30, 30]);
    svg.append('path')
        .datum(graticule)
        .attr('d', path)
        .attr('fill', 'none')
        .attr('stroke', '#0a3020')
        .attr('stroke-width', 0.5);

    // Load and render countries
    const world = await loadWorldMap();
    if (world && typeof topojson !== 'undefined') {
        const countries = topojson.feature(world, world.objects.countries);
        svg.append('g')
            .selectAll('path')
            .data(countries.features)
            .enter()
            .append('path')
            .attr('d', path)
            .attr('fill', '#0a2018')
            .attr('stroke', '#0f5040')
            .attr('stroke-width', 0.5);
    }

    // Render hotspots
    const overlays = document.getElementById('mapOverlays');
    if (overlays) {
        let html = '';

        // Intel hotspots
        INTEL_HOTSPOTS.forEach(spot => {
            const [x, y] = projection([spot.lon, spot.lat]) || [0, 0];
            if (x && y) {
                const activity = activityData[spot.id] || { level: 'low' };
                const color = activity.level === 'high' ? '#ff4444' :
                              activity.level === 'elevated' ? '#ffaa00' : '#00ff88';
                html += `<div class="hotspot" style="left:${x}px;top:${y}px;background:${color};" title="${spot.name}"></div>`;
            }
        });

        // Shipping chokepoints
        SHIPPING_CHOKEPOINTS.forEach(cp => {
            const [x, y] = projection([cp.lon, cp.lat]) || [0, 0];
            if (x && y) {
                html += `<div class="chokepoint" style="left:${x}px;top:${y}px;" title="${cp.name}">⚓</div>`;
            }
        });

        overlays.innerHTML = html;
    }
}

// Analyze hotspot activity from news
export function analyzeHotspotActivity(allNews = []) {
    const results = {};
    INTEL_HOTSPOTS.forEach(spot => {
        let score = 0;
        allNews.forEach(item => {
            const title = (item.title || '').toLowerCase();
            spot.keywords.forEach(kw => {
                if (title.includes(kw)) score++;
            });
        });
        results[spot.id] = {
            level: score >= 5 ? 'high' : score >= 2 ? 'elevated' : 'low',
            score
        };
    });
    return results;
}

// Stub exports for compatibility
export function setMapView() {}
export function mapZoomIn() {}
export function mapZoomOut() {}
export function mapZoomReset() {}
export function updateFlashback() {}
