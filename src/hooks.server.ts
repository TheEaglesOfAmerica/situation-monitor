/**
 * Server hooks
 * Initializes background services when the server starts
 */

import type { Handle } from '@sveltejs/kit';
import { startBackgroundScraping } from '$lib/server/news-scraper';

// Initialize background scraping on server start
let initialized = false;

export const handle: Handle = async ({ event, resolve }) => {
	// Start background scraping on first request
	if (!initialized) {
		console.log('[Hooks] Initializing background services...');
		startBackgroundScraping();
		initialized = true;
	}
	
	const response = await resolve(event);
	
	// Add CORS headers for API routes
	if (event.url.pathname.startsWith('/api/')) {
		response.headers.set('Access-Control-Allow-Origin', '*');
		response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
	}
	
	return response;
};
