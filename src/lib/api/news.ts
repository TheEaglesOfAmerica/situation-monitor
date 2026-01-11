/**
 * News API - Fetch news from GDELT and other sources
 */

import { FEEDS } from '$lib/config/feeds';
import type { NewsItem, NewsCategory } from '$lib/types';
import { containsAlertKeyword, detectRegion, detectTopics } from '$lib/config/keywords';

// Proxy URL for CORS requests
const PROXY_URL = 'https://situation-monitor-proxy.seanthielen-e.workers.dev/?url=';

// Delay between API requests to avoid rate limiting (ms)
const REQUEST_DELAY = 500;

/**
 * Simple hash function to generate unique IDs from URLs
 */
function hashCode(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash).toString(36);
}

/**
 * Delay helper
 */
function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

interface GdeltArticle {
	title: string;
	url: string;
	seendate: string;
	domain: string;
	socialimage?: string;
}

interface GdeltResponse {
	articles?: GdeltArticle[];
}

/**
 * Transform GDELT article to NewsItem
 */
function transformGdeltArticle(
	article: GdeltArticle,
	category: NewsCategory,
	source: string,
	index: number
): NewsItem {
	const title = article.title || '';
	const alert = containsAlertKeyword(title);
	// Generate unique ID using category, URL hash, and index
	const urlHash = article.url ? hashCode(article.url) : Math.random().toString(36).slice(2);
	const uniqueId = `gdelt-${category}-${urlHash}-${index}`;

	return {
		id: uniqueId,
		title,
		link: article.url,
		pubDate: article.seendate,
		timestamp: article.seendate ? new Date(article.seendate).getTime() : Date.now(),
		source: source || article.domain || 'Unknown',
		category,
		isAlert: !!alert,
		alertKeyword: alert?.keyword || undefined,
		region: detectRegion(title) ?? undefined,
		topics: detectTopics(title)
	};
}

/**
 * Fetch news for a specific category using GDELT via proxy
 */
export async function fetchCategoryNews(category: NewsCategory): Promise<NewsItem[]> {
	// Build query from category keywords (GDELT requires OR queries in parentheses)
	const categoryQueries: Record<NewsCategory, string> = {
		politics: '(politics OR government OR election OR congress)',
		tech: '(technology OR software OR startup OR "silicon valley")',
		finance: '(finance OR "stock market" OR economy OR banking)',
		gov: '("federal government" OR "white house" OR congress OR regulation)',
		ai: '("artificial intelligence" OR "machine learning" OR AI OR ChatGPT)',
		intel: '(intelligence OR security OR military OR defense)'
	};

	try {
		// Add English language filter and source country filter for relevant results
		const baseQuery = categoryQueries[category];
		const fullQuery = `${baseQuery} sourcelang:english`;
		// Build the raw GDELT URL (don't pre-encode query - let encodeURIComponent handle the whole URL once)
		const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${fullQuery}&mode=artlist&maxrecords=20&format=json&sort=date`;

		// Use proxy to avoid CORS - encode the whole URL once
		const proxyUrl = PROXY_URL + encodeURIComponent(gdeltUrl);
		console.log(`[News API] Fetching ${category} from:`, proxyUrl);

		const response = await fetch(proxyUrl);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		// Check content type before parsing as JSON
		const contentType = response.headers.get('content-type');
		if (!contentType?.includes('application/json')) {
			console.warn(`[News API] Non-JSON response for ${category}:`, contentType);
			return [];
		}

		const text = await response.text();
		let data: GdeltResponse;
		try {
			data = JSON.parse(text);
		} catch {
			console.warn(`[News API] Invalid JSON for ${category}:`, text.slice(0, 100));
			return [];
		}

		if (!data?.articles) return [];

		// Get source names for this category
		const categoryFeeds = FEEDS[category] || [];
		const defaultSource = categoryFeeds[0]?.name || 'News';

		return data.articles.map((article, index) =>
			transformGdeltArticle(article, category, article.domain || defaultSource, index)
		);
	} catch (error) {
		console.error(`[News API] Error fetching ${category}:`, error);
		return [];
	}
}

/**
 * Fetch all news - sequential with delays to avoid rate limiting
 */
export async function fetchAllNews(): Promise<Record<NewsCategory, NewsItem[]>> {
	const categories: NewsCategory[] = ['politics', 'tech', 'finance', 'gov', 'ai', 'intel'];
	const result: Record<NewsCategory, NewsItem[]> = {
		politics: [],
		tech: [],
		finance: [],
		gov: [],
		ai: [],
		intel: []
	};

	// Fetch categories sequentially with delay between each
	for (let i = 0; i < categories.length; i++) {
		const category = categories[i];

		// Add delay between requests (not before the first one)
		if (i > 0) {
			await delay(REQUEST_DELAY);
		}

		result[category] = await fetchCategoryNews(category);
	}

	return result;
}
