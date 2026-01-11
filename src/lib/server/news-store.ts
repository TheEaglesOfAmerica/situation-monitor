/**
 * Server-side news data store
 * Maintains a cache of news that persists between requests
 * Background scraping keeps this updated even without visitors
 */

import type { NewsItem, NewsCategory } from '$lib/types';

interface NewsCacheEntry {
	items: NewsItem[];
	lastUpdated: number;
}

interface NewsCache {
	[category: string]: NewsCacheEntry;
}

// In-memory cache for news data
let newsCache: NewsCache = {
	politics: { items: [], lastUpdated: 0 },
	tech: { items: [], lastUpdated: 0 },
	finance: { items: [], lastUpdated: 0 },
	gov: { items: [], lastUpdated: 0 },
	ai: { items: [], lastUpdated: 0 },
	intel: { items: [], lastUpdated: 0 },
	realtime: { items: [], lastUpdated: 0 }
};

// AI analysis cache
let aiAnalysisCache: Map<string, { significance: number; summary: string; timestamp: number }> = new Map();

// Background scraping timer
let scrapingInterval: ReturnType<typeof setInterval> | null = null;

export function getNewsCache(): NewsCache {
	return newsCache;
}

export function getCategoryNews(category: NewsCategory | 'realtime'): NewsCacheEntry {
	return newsCache[category] || { items: [], lastUpdated: 0 };
}

export function setCategoryNews(category: NewsCategory | 'realtime', items: NewsItem[]): void {
	newsCache[category] = {
		items,
		lastUpdated: Date.now()
	};
}

export function getAllNews(): NewsItem[] {
	const allItems: NewsItem[] = [];
	for (const category of Object.keys(newsCache)) {
		allItems.push(...newsCache[category].items);
	}
	// Sort by timestamp, most recent first
	return allItems.sort((a, b) => b.timestamp - a.timestamp);
}

export function getAiAnalysis(headlineId: string): { significance: number; summary: string } | null {
	const cached = aiAnalysisCache.get(headlineId);
	if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) { // 30 min TTL
		return { significance: cached.significance, summary: cached.summary };
	}
	return null;
}

export function setAiAnalysis(headlineId: string, significance: number, summary: string): void {
	aiAnalysisCache.set(headlineId, {
		significance,
		summary,
		timestamp: Date.now()
	});
	
	// Prune old entries
	if (aiAnalysisCache.size > 1000) {
		const oldestAllowed = Date.now() - 60 * 60 * 1000; // 1 hour
		for (const [key, value] of aiAnalysisCache.entries()) {
			if (value.timestamp < oldestAllowed) {
				aiAnalysisCache.delete(key);
			}
		}
	}
}

export function isScrapingActive(): boolean {
	return scrapingInterval !== null;
}

export function setScrapingInterval(interval: ReturnType<typeof setInterval> | null): void {
	scrapingInterval = interval;
}

export function getScrapingInterval(): ReturnType<typeof setInterval> | null {
	return scrapingInterval;
}
