/**
 * News API - Fetch news from GDELT and other sources
 */

import { FEEDS } from '$lib/config/feeds';
import type { NewsItem, NewsCategory } from '$lib/types';
import { containsAlertKeyword, detectRegion, detectTopics } from '$lib/config/keywords';
import { CORS_PROXY_URL, API_DELAYS, logger } from '$lib/config/api';

/**
 * Simple hash function to generate unique IDs from URLs
 */
function hashCode(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash).toString(36);
}

/**
 * Delay helper
 */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
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
 * Priority news sources - higher quality and reliability
 */
const PRIORITY_DOMAINS = new Set([
	'reuters.com',
	'apnews.com',
	'bbc.com',
	'bbc.co.uk',
	'theguardian.com',
	'nytimes.com',
	'washingtonpost.com',
	'foreignpolicy.com',
	'foreignaffairs.com',
	'csis.org',
	'brookings.edu',
	'economist.com',
	'ft.com',
	'wsj.com',
	'politico.com',
	'defenseone.com',
	'breakingdefense.com'
]);

/**
 * Calculate relevance score for an article (0-100)
 */
function calculateRelevanceScore(article: GdeltArticle, category: NewsCategory): number {
	let score = 50; // Base score
	const title = (article.title || '').toLowerCase();
	const domain = (article.domain || '').toLowerCase();

	// Boost for priority sources
	if (PRIORITY_DOMAINS.has(domain)) {
		score += 20;
	}

	// Boost for alert keywords
	if (containsAlertKeyword(title).isAlert) {
		score += 15;
	}

	// Boost for recent articles (within 24 hours)
	if (article.seendate) {
		const age = Date.now() - new Date(article.seendate).getTime();
		const hoursOld = age / (1000 * 60 * 60);
		if (hoursOld < 6) score += 15;
		else if (hoursOld < 24) score += 10;
		else if (hoursOld < 48) score += 5;
	}

	// Boost for region detection
	if (detectRegion(title)) {
		score += 10;
	}

	// Boost for multiple topics
	const topics = detectTopics(title);
	score += Math.min(topics.length * 5, 15);

	// Penalize clickbait patterns
	if (title.includes('you won\'t believe') || title.includes('shocking') || title.includes('amazing')) {
		score -= 20;
	}

	return Math.max(0, Math.min(100, score));
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
		topics: detectTopics(title),
		relevanceScore: calculateRelevanceScore(article, category)
	};
}

/**
 * Fetch news for a specific category using GDELT via proxy
 */
export async function fetchCategoryNews(category: NewsCategory): Promise<NewsItem[]> {
	// Build query from category keywords - optimized for geopolitical relevance
	const categoryQueries: Record<NewsCategory, string> = {
		politics: '(geopolitics OR "foreign policy" OR diplomacy OR sanctions OR "international relations" OR summit OR treaty)',
		tech: '(cybersecurity OR "tech regulation" OR "chip war" OR semiconductor OR "critical infrastructure" OR "tech sanctions")',
		finance: '(sanctions OR "central bank" OR inflation OR "trade war" OR "currency crisis" OR BRICS OR "sovereign debt")',
		gov: '(pentagon OR "state department" OR "national security" OR executive OR "defense budget" OR NATO)',
		ai: '("AI regulation" OR "artificial intelligence" OR "AI arms race" OR deepfake OR "AI military" OR "autonomous weapons")',
		intel: '(espionage OR intelligence OR CIA OR "cyber attack" OR surveillance OR counterintelligence OR OSINT)'
	};

	// Prioritize high-impact sources
	const prioritySources = [
		'reuters.com',
		'apnews.com',
		'bbc.com',
		'theguardian.com',
		'foreignpolicy.com',
		'foreignaffairs.com',
		'csis.org',
		'brookings.edu'
	];

	try {
		// Add English language filter and focus on international/breaking news
		const baseQuery = categoryQueries[category];
		const fullQuery = `${baseQuery} sourcelang:english (domain:reuters.com OR domain:bbc.com OR domain:apnews.com OR "breaking" OR "developing")`;
		// Build the raw GDELT URL - increase maxrecords for better filtering
		const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${fullQuery}&mode=artlist&maxrecords=30&format=json&sort=date`;

		// Use proxy to avoid CORS - encode the whole URL once
		const proxyUrl = CORS_PROXY_URL + encodeURIComponent(gdeltUrl);
		logger.log('News API', `Fetching ${category} from:`, proxyUrl);

		const response = await fetch(proxyUrl);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		// Check content type before parsing as JSON
		const contentType = response.headers.get('content-type');
		if (!contentType?.includes('application/json')) {
			logger.warn('News API', `Non-JSON response for ${category}:`, contentType);
			return [];
		}

		const text = await response.text();
		let data: GdeltResponse;
		try {
			data = JSON.parse(text);
		} catch {
			logger.warn('News API', `Invalid JSON for ${category}:`, text.slice(0, 100));
			return [];
		}

		if (!data?.articles) return [];

		// Get source names for this category
		const categoryFeeds = FEEDS[category] || [];
		const defaultSource = categoryFeeds[0]?.name || 'News';

		// Transform articles and sort by relevance score
		const articles = data.articles
			.map((article, index) =>
				transformGdeltArticle(article, category, article.domain || defaultSource, index)
			)
			.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
			.slice(0, 15); // Return top 15 most relevant

		return articles;
	} catch (error) {
		logger.error('News API', `Error fetching ${category}:`, error);
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
			await delay(API_DELAYS.betweenCategories);
		}

		result[category] = await fetchCategoryNews(category);
	}

	return result;
}
