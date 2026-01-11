/**
 * Server-side news scraping service
 * Fetches news from multiple sources and stores in memory
 * Runs continuously even without visitors
 */

import type { NewsItem, NewsCategory } from '$lib/types';
import { setCategoryNews, setScrapingInterval, getScrapingInterval, isScrapingActive } from './news-store';
import { env } from '$env/dynamic/private';

// Get environment variables with defaults
const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY || '';
const NEWS_REFRESH_INTERVAL = env.NEWS_REFRESH_INTERVAL || '300000';
const ENABLE_BACKGROUND_SCRAPING = env.ENABLE_BACKGROUND_SCRAPING || 'true';

// RSS Feed sources - expanded for broader coverage
const RSS_SOURCES: Record<string, { url: string; category: NewsCategory | 'realtime' }[]> = {
	// Google News RSS feeds
	google: [
		{ url: 'https://news.google.com/rss/search?q=geopolitics+OR+diplomacy+OR+"foreign+policy"&hl=en-US&gl=US&ceid=US:en', category: 'politics' },
		{ url: 'https://news.google.com/rss/search?q=cybersecurity+OR+"chip+war"+OR+semiconductor&hl=en-US&gl=US&ceid=US:en', category: 'tech' },
		{ url: 'https://news.google.com/rss/search?q=sanctions+OR+"trade+war"+OR+BRICS+OR+inflation&hl=en-US&gl=US&ceid=US:en', category: 'finance' },
		{ url: 'https://news.google.com/rss/search?q=pentagon+OR+NATO+OR+"national+security"&hl=en-US&gl=US&ceid=US:en', category: 'gov' },
		{ url: 'https://news.google.com/rss/search?q="artificial+intelligence"+OR+"AI+regulation"&hl=en-US&gl=US&ceid=US:en', category: 'ai' },
		{ url: 'https://news.google.com/rss/search?q=espionage+OR+intelligence+OR+"cyber+attack"&hl=en-US&gl=US&ceid=US:en', category: 'intel' }
	],
	// Direct RSS feeds from major outlets
	direct: [
		{ url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'politics' },
		{ url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', category: 'politics' },
		{ url: 'https://feeds.reuters.com/reuters/topNews', category: 'realtime' },
		{ url: 'https://feeds.reuters.com/reuters/worldNews', category: 'politics' },
		{ url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'politics' },
		{ url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', category: 'tech' },
		{ url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'tech' },
		{ url: 'https://www.theguardian.com/world/rss', category: 'politics' },
		{ url: 'https://www.theguardian.com/technology/rss', category: 'tech' },
		{ url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', category: 'finance' },
		{ url: 'https://feeds.bloomberg.com/markets/news.rss', category: 'finance' }
	],
	// Real-time / breaking news
	breaking: [
		{ url: 'https://news.google.com/rss/search?q=breaking+news&hl=en-US&gl=US&ceid=US:en', category: 'realtime' },
		{ url: 'https://feeds.bbci.co.uk/news/rss.xml', category: 'realtime' }
	]
};

// Alert keywords for prioritization
const ALERT_KEYWORDS = [
	'breaking', 'urgent', 'emergency', 'attack', 'explosion', 'war', 'invasion',
	'missile', 'nuclear', 'sanctions', 'crisis', 'outbreak', 'collapse', 'coup',
	'assassination', 'drone strike', 'cyber attack', 'hostage', 'terror'
];

// Priority sources for relevance scoring
const PRIORITY_SOURCES = new Set([
	'reuters', 'associated press', 'ap news', 'bbc', 'the guardian',
	'new york times', 'washington post', 'foreign policy', 'foreign affairs',
	'the economist', 'financial times', 'wall street journal', 'politico',
	'al jazeera', 'dw', 'france24'
]);

/**
 * Parse RSS XML to news items
 */
function parseRSS(xmlText: string, category: NewsCategory | 'realtime', sourceUrl: string): NewsItem[] {
	const items: NewsItem[] = [];
	
	// Simple regex-based XML parsing (server-side, no DOMParser)
	const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
	let match;
	let index = 0;
	
	while ((match = itemRegex.exec(xmlText)) !== null) {
		const itemXml = match[1];
		
		const title = extractTag(itemXml, 'title');
		const link = extractTag(itemXml, 'link');
		const pubDate = extractTag(itemXml, 'pubDate');
		const description = extractTag(itemXml, 'description');
		const source = extractTag(itemXml, 'source') || extractSourceFromUrl(sourceUrl);
		
		if (!title || !link) continue;
		
		const titleLower = title.toLowerCase();
		const sourceLower = source.toLowerCase();
		
		// Check for alert keywords
		const alertKeyword = ALERT_KEYWORDS.find(kw => titleLower.includes(kw));
		
		// Calculate relevance score
		let relevanceScore = 50;
		
		// Boost for priority sources
		for (const ps of PRIORITY_SOURCES) {
			if (sourceLower.includes(ps)) {
				relevanceScore += 20;
				break;
			}
		}
		
		// Boost for alert keywords
		if (alertKeyword) {
			relevanceScore += 15;
		}
		
		// Boost for recency
		if (pubDate) {
			const age = Date.now() - new Date(pubDate).getTime();
			const hoursOld = age / (1000 * 60 * 60);
			if (hoursOld < 1) relevanceScore += 20;
			else if (hoursOld < 6) relevanceScore += 15;
			else if (hoursOld < 24) relevanceScore += 10;
		}
		
		items.push({
			id: `rss-${category}-${hashCode(link)}-${index}`,
			title: decodeHTMLEntities(title),
			link,
			description: description ? decodeHTMLEntities(description).slice(0, 200) : undefined,
			pubDate,
			timestamp: pubDate ? new Date(pubDate).getTime() : Date.now(),
			source: decodeHTMLEntities(source),
			category: category === 'realtime' ? 'politics' : category,
			isAlert: !!alertKeyword,
			alertKeyword,
			relevanceScore: Math.min(100, relevanceScore)
		});
		
		index++;
	}
	
	return items;
}

function extractTag(xml: string, tag: string): string {
	const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
	const match = xml.match(regex);
	return match ? (match[1] || match[2] || '').trim() : '';
}

function extractSourceFromUrl(url: string): string {
	try {
		const hostname = new URL(url).hostname;
		return hostname.replace('www.', '').replace('.com', '').replace('.org', '');
	} catch {
		return 'Unknown';
	}
}

function hashCode(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return Math.abs(hash).toString(36);
}

function decodeHTMLEntities(text: string): string {
	return text
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/<[^>]*>/g, ''); // Strip HTML tags
}

/**
 * Fetch a single RSS feed
 */
async function fetchFeed(url: string, category: NewsCategory | 'realtime'): Promise<NewsItem[]> {
	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent': 'SituationMonitor/2.0 (News Aggregator)',
				'Accept': 'application/rss+xml, application/xml, text/xml'
			},
			signal: AbortSignal.timeout(10000)
		});
		
		if (!response.ok) {
			console.warn(`[News Scraper] Failed to fetch ${url}: ${response.status}`);
			return [];
		}
		
		const xmlText = await response.text();
		return parseRSS(xmlText, category, url);
	} catch (error) {
		console.warn(`[News Scraper] Error fetching ${url}:`, error);
		return [];
	}
}

/**
 * Fetch all news from all sources
 */
export async function scrapeAllNews(): Promise<void> {
	console.log('[News Scraper] Starting full scrape...');
	
	const categoryItems: Record<string, NewsItem[]> = {
		politics: [],
		tech: [],
		finance: [],
		gov: [],
		ai: [],
		intel: [],
		realtime: []
	};
	
	// Fetch all feeds in parallel (grouped by source type)
	const allFeeds = [
		...RSS_SOURCES.google,
		...RSS_SOURCES.direct,
		...RSS_SOURCES.breaking
	];
	
	const results = await Promise.allSettled(
		allFeeds.map(feed => fetchFeed(feed.url, feed.category))
	);
	
	// Aggregate results by category
	results.forEach((result, index) => {
		if (result.status === 'fulfilled') {
			const category = allFeeds[index].category;
			categoryItems[category].push(...result.value);
		}
	});
	
	// Deduplicate and sort by relevance within each category
	for (const category of Object.keys(categoryItems)) {
		const items = categoryItems[category];
		
		// Dedupe by title similarity
		const seen = new Set<string>();
		const deduped = items.filter(item => {
			const key = item.title.toLowerCase().slice(0, 50);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		
		// Sort by relevance and recency
		const sorted = deduped
			.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
			.slice(0, 50); // Keep top 50 per category
		
		setCategoryNews(category as NewsCategory | 'realtime', sorted);
	}
	
	console.log('[News Scraper] Scrape complete. Items per category:', 
		Object.fromEntries(Object.entries(categoryItems).map(([k, v]) => [k, v.length]))
	);
}

/**
 * Start background scraping
 */
export function startBackgroundScraping(): void {
	if (isScrapingActive()) {
		console.log('[News Scraper] Background scraping already active');
		return;
	}
	
	if (ENABLE_BACKGROUND_SCRAPING !== 'true') {
		console.log('[News Scraper] Background scraping disabled');
		return;
	}
	
	const interval = parseInt(NEWS_REFRESH_INTERVAL || '300000', 10);
	
	console.log(`[News Scraper] Starting background scraping with ${interval}ms interval`);
	
	// Initial scrape
	scrapeAllNews();
	
	// Set up recurring scrape
	const timer = setInterval(() => {
		scrapeAllNews();
	}, interval);
	
	setScrapingInterval(timer);
}

/**
 * Stop background scraping
 */
export function stopBackgroundScraping(): void {
	const interval = getScrapingInterval();
	if (interval) {
		clearInterval(interval);
		setScrapingInterval(null);
		console.log('[News Scraper] Background scraping stopped');
	}
}

/**
 * Analyze headlines with AI (Mistral via OpenRouter)
 */
export async function analyzeWithAI(headlines: string[]): Promise<{ significance: number; summary: string }[]> {
	if (!OPENROUTER_API_KEY) {
		console.warn('[AI Analysis] No API key configured');
		return headlines.map(() => ({ significance: 5, summary: '' }));
	}
	
	try {
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://situation-monitor.app',
				'X-Title': 'Situation Monitor'
			},
			body: JSON.stringify({
				model: 'mistralai/ministral-8b',
				messages: [
					{
						role: 'system',
						content: `You are a geopolitical analyst. For each headline, provide:
1. A significance score (1-10) where 10 is extremely important global news
2. A brief one-sentence summary of why it matters

Respond in JSON format: [{"significance": number, "summary": "string"}, ...]`
					},
					{
						role: 'user',
						content: `Analyze these headlines:\n${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
					}
				],
				temperature: 0.3,
				max_tokens: 1000
			})
		});
		
		if (!response.ok) {
			throw new Error(`OpenRouter API error: ${response.status}`);
		}
		
		const data = await response.json();
		const content = data.choices?.[0]?.message?.content || '[]';
		
		// Parse JSON from response
		const jsonMatch = content.match(/\[[\s\S]*\]/);
		if (jsonMatch) {
			return JSON.parse(jsonMatch[0]);
		}
		
		return headlines.map(() => ({ significance: 5, summary: '' }));
	} catch (error) {
		console.error('[AI Analysis] Error:', error);
		return headlines.map(() => ({ significance: 5, summary: '' }));
	}
}
