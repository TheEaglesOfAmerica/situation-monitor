/**
 * News API endpoint
 * GET /api/news - Returns all cached news by category
 * GET /api/news?category=politics - Returns specific category
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getNewsCache, getCategoryNews } from '$lib/server/news-store';
import { scrapeAllNews, startBackgroundScraping } from '$lib/server/news-scraper';

// Ensure background scraping is running
let initialized = false;

export const GET: RequestHandler = async ({ url }) => {
	// Start background scraping on first request
	if (!initialized) {
		startBackgroundScraping();
		initialized = true;
	}
	
	const category = url.searchParams.get('category');
	const forceRefresh = url.searchParams.get('refresh') === 'true';
	
	// Force refresh if requested
	if (forceRefresh) {
		await scrapeAllNews();
	}
	
	if (category) {
		const data = getCategoryNews(category as any);
		return json({
			category,
			items: data.items,
			lastUpdated: data.lastUpdated,
			count: data.items.length
		});
	}
	
	// Return all news organized by category
	const cache = getNewsCache();
	
	return json({
		politics: cache.politics?.items || [],
		tech: cache.tech?.items || [],
		finance: cache.finance?.items || [],
		gov: cache.gov?.items || [],
		ai: cache.ai?.items || [],
		intel: cache.intel?.items || [],
		realtime: cache.realtime?.items || [],
		lastUpdated: Math.max(
			...Object.values(cache).map(c => c.lastUpdated || 0)
		)
	});
};

export const POST: RequestHandler = async () => {
	// Trigger manual refresh
	await scrapeAllNews();
	
	return json({
		success: true,
		message: 'News refresh triggered'
	});
};
