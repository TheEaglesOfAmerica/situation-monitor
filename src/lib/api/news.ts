/**
 * News API - Fetches news from server-side API
 * Server handles RSS scraping and caching continuously
 */

import type { NewsItem, NewsCategory } from '$lib/types';
import { logger } from '$lib/config/api';

/**
 * Fetch news for a specific category from server API
 */
export async function fetchCategoryNews(category: NewsCategory): Promise<NewsItem[]> {
	try {
		logger.log('News API', `Fetching ${category} news from server`);
		
		const response = await fetch(`/api/news?category=${category}`);
		
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		
		const data = await response.json();
		return data.items || [];
	} catch (error) {
		logger.error('News API', `Error fetching ${category}:`, error);
		return [];
	}
}

/**
 * Fetch all news from server API
 */
export async function fetchAllNews(): Promise<Record<NewsCategory, NewsItem[]>> {
	try {
		logger.log('News API', 'Fetching all news from server');
		
		const response = await fetch('/api/news');
		
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		
		const data = await response.json();
		
		return {
			politics: data.politics || [],
			tech: data.tech || [],
			finance: data.finance || [],
			gov: data.gov || [],
			ai: data.ai || [],
			intel: data.intel || []
		};
	} catch (error) {
		logger.error('News API', 'Error fetching all news:', error);
		return {
			politics: [],
			tech: [],
			finance: [],
			gov: [],
			ai: [],
			intel: []
		};
	}
}

/**
 * Fetch real-time/breaking news from server API
 */
export async function fetchRealtimeNews(): Promise<NewsItem[]> {
	try {
		const response = await fetch('/api/news?category=realtime');
		
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		
		const data = await response.json();
		return data.items || [];
	} catch (error) {
		logger.error('News API', 'Error fetching realtime news:', error);
		return [];
	}
}
