/**
 * Server-side news API endpoint using Google News Scraper
 * This runs on the server to use Puppeteer for scraping Google News
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import googleNewsScraper from 'google-news-scraper';
import type { NewsCategory, NewsItem } from '$lib/types';
import { containsAlertKeyword, detectRegion, detectTopics } from '$lib/config/keywords';

interface GoogleNewsArticle {
	title: string;
	link: string;
	image?: string;
	source: string;
	datetime?: string;
	time?: string;
	articleType?: string;
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
	'breakingdefense.com',
	'aljazeera.com',
	'dw.com'
]);

/**
 * Calculate relevance score for an article (0-100)
 */
function calculateRelevanceScore(article: GoogleNewsArticle): number {
	let score = 50; // Base score
	const title = (article.title || '').toLowerCase();
	const source = (article.source || '').toLowerCase();

	// Boost for priority sources
	for (const domain of PRIORITY_DOMAINS) {
		if (source.includes(domain.replace('.com', '').replace('.co.uk', ''))) {
			score += 20;
			break;
		}
	}

	// Boost for alert keywords
	if (containsAlertKeyword(title).isAlert) {
		score += 15;
	}

	// Boost for recent articles
	if (article.datetime) {
		const age = Date.now() - new Date(article.datetime).getTime();
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
	if (title.includes("you won't believe") || title.includes('shocking') || title.includes('amazing')) {
		score -= 20;
	}

	return Math.max(0, Math.min(100, score));
}

/**
 * Simple hash function to generate unique IDs
 */
function hashCode(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return Math.abs(hash).toString(36);
}

/**
 * Transform Google News article to NewsItem
 */
function transformArticle(
	article: GoogleNewsArticle,
	category: NewsCategory,
	index: number
): NewsItem {
	const title = article.title || '';
	const alert = containsAlertKeyword(title);
	const urlHash = article.link ? hashCode(article.link) : Math.random().toString(36).slice(2);
	const uniqueId = `gnews-${category}-${urlHash}-${index}`;

	const timestamp = article.datetime ? new Date(article.datetime).getTime() : Date.now();

	return {
		id: uniqueId,
		title,
		link: article.link,
		pubDate: article.datetime || article.time || new Date().toISOString(),
		timestamp,
		source: article.source || 'Unknown',
		category,
		isAlert: !!alert,
		alertKeyword: alert?.keyword || undefined,
		region: detectRegion(title) ?? undefined,
		topics: detectTopics(title),
		relevanceScore: calculateRelevanceScore(article)
	};
}

/**
 * Search terms optimized for geopolitical intelligence
 */
const CATEGORY_SEARCH_TERMS: Record<NewsCategory, string> = {
	politics: 'geopolitics international relations diplomacy foreign policy',
	tech: 'cybersecurity technology sanctions chip semiconductor',
	finance: 'sanctions economy trade war BRICS currency crisis',
	gov: 'pentagon defense national security NATO military',
	ai: 'AI regulation artificial intelligence autonomous weapons',
	intel: 'intelligence espionage CIA surveillance cyber attack'
};

/**
 * Cache for news results (5 minute TTL)
 */
interface CacheEntry {
	data: NewsItem[];
	timestamp: number;
}

const newsCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): NewsItem[] | null {
	const entry = newsCache.get(key);
	if (!entry) return null;
	if (Date.now() - entry.timestamp > CACHE_TTL) {
		newsCache.delete(key);
		return null;
	}
	return entry.data;
}

function setCache(key: string, data: NewsItem[]): void {
	newsCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Fetch news for a specific category
 */
async function fetchCategoryNews(category: NewsCategory): Promise<NewsItem[]> {
	const cacheKey = `news-${category}`;
	const cached = getCached(cacheKey);
	if (cached) return cached;

	try {
		const searchTerm = CATEGORY_SEARCH_TERMS[category];
		
		const articles = await googleNewsScraper({
			searchTerm,
			prettyURLs: true,
			timeframe: '24h',
			puppeteerArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
			logLevel: 'error',
			limit: 20
		}) as GoogleNewsArticle[];

		if (!articles || articles.length === 0) {
			console.log(`[News API] No articles found for ${category}`);
			return [];
		}

		// Transform and sort by relevance
		const newsItems = articles
			.map((article, index) => transformArticle(article, category, index))
			.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
			.slice(0, 15);

		setCache(cacheKey, newsItems);
		return newsItems;
	} catch (error) {
		console.error(`[News API] Error fetching ${category}:`, error);
		return [];
	}
}

/**
 * GET handler - fetch news for one or all categories
 */
export const GET: RequestHandler = async ({ url }) => {
	const category = url.searchParams.get('category') as NewsCategory | 'all' | null;

	try {
		if (category && category !== 'all') {
			// Fetch single category
			const news = await fetchCategoryNews(category);
			return json({ [category]: news });
		}

		// Fetch all categories
		const categories: NewsCategory[] = ['politics', 'tech', 'finance', 'gov', 'ai', 'intel'];
		const result: Record<NewsCategory, NewsItem[]> = {
			politics: [],
			tech: [],
			finance: [],
			gov: [],
			ai: [],
			intel: []
		};

		// Fetch categories with small delays to avoid rate limiting
		for (let i = 0; i < categories.length; i++) {
			const cat = categories[i];
			if (i > 0) {
				await new Promise(resolve => setTimeout(resolve, 500));
			}
			result[cat] = await fetchCategoryNews(cat);
		}

		return json(result);
	} catch (error) {
		console.error('[News API] Error:', error);
		return json({ error: 'Failed to fetch news' }, { status: 500 });
	}
};
