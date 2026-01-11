/**
 * News API - Fetch news from Google News RSS feeds
 * Uses Cloudflare Worker for RSS-to-JSON parsing
 */

import type { NewsItem, NewsCategory } from '$lib/types';
import { containsAlertKeyword, detectRegion, detectTopics } from '$lib/config/keywords';
import { API_DELAYS, logger } from '$lib/config/api';

// Cloudflare Worker URL for RSS parsing
const WORKER_URL = 'https://situation-monitor-proxy.seanthielen-e.workers.dev';

/**
 * Priority news sources - higher quality and reliability
 */
const PRIORITY_SOURCES = new Set([
	'reuters',
	'associated press',
	'ap news',
	'bbc',
	'the guardian',
	'new york times',
	'washington post',
	'foreign policy',
	'foreign affairs',
	'the economist',
	'financial times',
	'wall street journal',
	'politico',
	'al jazeera',
	'dw'
]);

/**
 * Calculate relevance score for an article (0-100)
 */
function calculateRelevanceScore(title: string, source: string, pubDate: string): number {
	let score = 50;
	const titleLower = title.toLowerCase();
	const sourceLower = source.toLowerCase();

	// Boost for priority sources
	for (const prioritySource of PRIORITY_SOURCES) {
		if (sourceLower.includes(prioritySource)) {
			score += 20;
			break;
		}
	}

	// Boost for alert keywords
	if (containsAlertKeyword(titleLower).isAlert) {
		score += 15;
	}

	// Boost for recent articles
	if (pubDate) {
		const age = Date.now() - new Date(pubDate).getTime();
		const hoursOld = age / (1000 * 60 * 60);
		if (hoursOld < 6) score += 15;
		else if (hoursOld < 24) score += 10;
		else if (hoursOld < 48) score += 5;
	}

	// Boost for region detection
	if (detectRegion(titleLower)) {
		score += 10;
	}

	// Boost for multiple topics
	const topics = detectTopics(titleLower);
	score += Math.min(topics.length * 5, 15);

	// Penalize clickbait
	if (titleLower.includes("you won't believe") || titleLower.includes('shocking')) {
		score -= 20;
	}

	return Math.max(0, Math.min(100, score));
}

/**
 * Simple hash function for unique IDs
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
 * Extract content from XML tag
 */
function extractTag(xml: string, tag: string): string {
	const regex = new RegExp(
		`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`
	);
	const match = xml.match(regex);
	return match ? (match[1] || match[2] || '').trim() : '';
}

/**
 * Decode HTML entities
 */
function decodeHTMLEntities(text: string): string {
	return text
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'");
}

/**
 * Parse RSS XML and extract articles
 */
function parseRSS(xml: string, category: NewsCategory): NewsItem[] {
	const items: NewsItem[] = [];

	// Simple regex-based XML parsing (works for Google News RSS)
	const itemRegex = /<item>([\s\S]*?)<\/item>/g;
	let match;
	let index = 0;

	while ((match = itemRegex.exec(xml)) !== null) {
		const itemXml = match[1];

		// Extract fields
		const title = extractTag(itemXml, 'title');
		const link = extractTag(itemXml, 'link');
		const pubDate = extractTag(itemXml, 'pubDate');
		const source = extractTag(itemXml, 'source') || 'Google News';

		if (!title || !link) continue;

		const urlHash = hashCode(link);
		const alert = containsAlertKeyword(title);

		items.push({
			id: `gnews-${category}-${urlHash}-${index}`,
			title: decodeHTMLEntities(title),
			link,
			pubDate,
			timestamp: pubDate ? new Date(pubDate).getTime() : Date.now(),
			source: decodeHTMLEntities(source),
			category,
			isAlert: !!alert,
			alertKeyword: alert?.keyword || undefined,
			region: detectRegion(title) ?? undefined,
			topics: detectTopics(title),
			relevanceScore: calculateRelevanceScore(title, source, pubDate)
		});
		index++;
	}

	return items;
}

/**
 * Search terms for each category - optimized for geopolitical intelligence
 */
const CATEGORY_QUERIES: Record<NewsCategory, string> = {
	politics: 'geopolitics OR diplomacy OR "foreign policy" OR sanctions OR "international relations"',
	tech: 'cybersecurity OR "chip war" OR semiconductor OR "tech regulation" OR "critical infrastructure"',
	finance: 'sanctions OR "trade war" OR BRICS OR "central bank" OR inflation OR "currency crisis"',
	gov: 'pentagon OR NATO OR "national security" OR "defense budget" OR "state department"',
	ai: '"artificial intelligence" OR "AI regulation" OR "AI military" OR "autonomous weapons"',
	intel: 'espionage OR intelligence OR "cyber attack" OR surveillance OR counterintelligence'
};

/**
 * Delay helper
 */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch news for a specific category using Cloudflare Worker JSON API
 */
export async function fetchCategoryNews(category: NewsCategory): Promise<NewsItem[]> {
	try {
		const query = encodeURIComponent(CATEGORY_QUERIES[category]);
		const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
		const workerUrl = `${WORKER_URL}/?url=${encodeURIComponent(rssUrl)}&format=json`;

		logger.log('News API', `Fetching ${category} from Worker`);

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 15000);

		try {
			const response = await fetch(workerUrl, { signal: controller.signal });
			clearTimeout(timeoutId);

			if (!response.ok) {
				logger.error('News API', `HTTP ${response.status} for ${category}`);
				return [];
			}

			const data = await response.json();
			
			if (data.status !== 'ok' || !data.items || !Array.isArray(data.items)) {
				logger.warn('News API', `Invalid response for ${category}`);
				return [];
			}

			const articles = data.items.slice(0, 20).map((item: any, index: number) => {
				const title = (item.title || '').trim();
				const source = (item.source || 'Google News').trim();
				const link = item.link || '';
				const pubDate = item.pubDate || '';
				const alert = containsAlertKeyword(title);

				return {
					id: `gnews-${category}-${hashCode(link)}-${index}`,
					title: decodeHTMLEntities(title),
					link,
					pubDate,
					timestamp: pubDate ? new Date(pubDate).getTime() : Date.now(),
					source: decodeHTMLEntities(source),
					category,
					isAlert: !!alert,
					alertKeyword: alert?.keyword || undefined,
					region: detectRegion(title) ?? undefined,
					topics: detectTopics(title),
					relevanceScore: calculateRelevanceScore(title, source, pubDate)
				};
			});

			const sorted = articles
				.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
				.slice(0, 15);

			logger.log('News API', `Fetched ${sorted.length} ${category} articles`);
			return sorted;
		} catch (fetchError) {
			clearTimeout(timeoutId);
			if (fetchError instanceof Error && fetchError.name === 'AbortError') {
				logger.error('News API', `Timeout for ${category}`);
			} else {
				logger.error('News API', `Fetch error for ${category}:`, fetchError);
			}
			return [];
		}
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
