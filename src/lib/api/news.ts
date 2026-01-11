/**
 * News API - Fetch news from server-side Google News scraper
 */

import type { NewsItem, NewsCategory } from '$lib/types';
import { logger } from '$lib/config/api';

/**
 * Fetch news for a specific category from the server API
 */
export async function fetchCategoryNews(category: NewsCategory): Promise<NewsItem[]> {
	try {
		const response = await fetch(`/api/news?category=${category}`);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();
		return data[category] || [];
	} catch (error) {
		logger.error('News API', `Error fetching ${category}:`, error);
		return [];
	}
}

/**
 * Fetch all news from the server API
 */
export async function fetchAllNews(): Promise<Record<NewsCategory, NewsItem[]>> {
	const result: Record<NewsCategory, NewsItem[]> = {
		politics: [],
		tech: [],
		finance: [],
		gov: [],
		ai: [],
		intel: []
	};

	try {
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
		return result;
	}
}
