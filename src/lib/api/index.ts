/**
 * API barrel exports
 * 
 * Client-side API functions that fetch from server endpoints
 * when available, falling back to direct fetching
 */

// Re-export types
export type { Prediction, WhaleTransaction, Contract, Layoff } from './misc';

import type { NewsItem, NewsCategory } from '$lib/types';
import type { Prediction, WhaleTransaction, Contract, Layoff } from './misc';

// Import fallback functions
import { fetchAllNews as fetchAllNewsDirect, fetchCategoryNews as fetchCategoryNewsDirect } from './news';
import { fetchAllMarkets as fetchAllMarketsDirect, fetchCryptoPrices as fetchCryptoPricesDirect } from './markets';
import { fetchPolymarket as fetchPolymarketDirect, fetchWhaleTransactions as fetchWhalesDirect, fetchGovContracts as fetchContractsDirect, fetchLayoffs as fetchLayoffsDirect } from './misc';

/**
 * Check if server API is available
 */
async function isServerAvailable(): Promise<boolean> {
	try {
		const response = await fetch('/api/news', { 
			method: 'HEAD',
			signal: AbortSignal.timeout(2000) 
		});
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Fetch all news - tries server first, falls back to direct
 */
export async function fetchAllNews(): Promise<Record<NewsCategory, NewsItem[]>> {
	try {
		const response = await fetch('/api/news', {
			signal: AbortSignal.timeout(10000)
		});
		
		if (response.ok) {
			const data = await response.json();
			// Convert flat items array to categorized format
			const categorized: Record<NewsCategory, NewsItem[]> = {
				politics: [],
				tech: [],
				finance: [],
				gov: [],
				ai: [],
				intel: []
			};
			
			for (const item of data.items || []) {
				if (categorized[item.category as NewsCategory]) {
					categorized[item.category as NewsCategory].push(item);
				}
			}
			
			return categorized;
		}
	} catch (error) {
		console.warn('[API] Server unavailable, using direct fetch:', error);
	}
	
	return fetchAllNewsDirect();
}

/**
 * Fetch news for a specific category
 */
export async function fetchCategoryNews(category: NewsCategory): Promise<NewsItem[]> {
	try {
		const response = await fetch(`/api/news?category=${category}`, {
			signal: AbortSignal.timeout(10000)
		});
		
		if (response.ok) {
			const data = await response.json();
			return data.items || [];
		}
	} catch {
		// Fall back to direct fetch
	}
	
	return fetchCategoryNewsDirect(category);
}

/**
 * Fetch all market data
 */
export async function fetchAllMarkets() {
	try {
		const response = await fetch('/api/markets', {
			signal: AbortSignal.timeout(10000)
		});
		
		if (response.ok) {
			return await response.json();
		}
	} catch {
		// Fall back to direct fetch
	}
	
	return fetchAllMarketsDirect();
}

/**
 * Fetch crypto prices
 */
export async function fetchCryptoPrices() {
	try {
		const response = await fetch('/api/markets', {
			signal: AbortSignal.timeout(10000)
		});
		
		if (response.ok) {
			const data = await response.json();
			return data.crypto || [];
		}
	} catch {
		// Fall back
	}
	
	return fetchCryptoPricesDirect();
}

// Re-export other market functions
export { fetchIndices, fetchSectorPerformance, fetchCommodities } from './markets';

/**
 * Fetch misc data (contracts, layoffs, predictions, whales)
 */
export async function fetchMiscData(): Promise<{
	predictions: Prediction[];
	whales: WhaleTransaction[];
	contracts: Contract[];
	layoffs: Layoff[];
}> {
	try {
		const response = await fetch('/api/data', {
			signal: AbortSignal.timeout(10000)
		});
		
		if (response.ok) {
			return await response.json();
		}
	} catch {
		// Fall back to direct fetch
	}
	
	const [predictions, whales, contracts, layoffs] = await Promise.all([
		fetchPolymarketDirect(),
		fetchWhalesDirect(),
		fetchContractsDirect(),
		fetchLayoffsDirect()
	]);
	
	return { predictions, whales, contracts, layoffs };
}

// Re-export individual functions for backwards compatibility
export async function fetchPolymarket(): Promise<Prediction[]> {
	const data = await fetchMiscData();
	return data.predictions;
}

export async function fetchWhaleTransactions(): Promise<WhaleTransaction[]> {
	const data = await fetchMiscData();
	return data.whales;
}

export async function fetchGovContracts(): Promise<Contract[]> {
	const data = await fetchMiscData();
	return data.contracts;
}

export async function fetchLayoffs(): Promise<Layoff[]> {
	const data = await fetchMiscData();
	return data.layoffs;
}

/**
 * Analyze headlines with AI (server-side)
 */
export async function analyzeHeadlinesWithAI(headlines: string[]): Promise<{ significance: number; summary: string }[]> {
	try {
		const response = await fetch('/api/ai', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ headlines }),
			signal: AbortSignal.timeout(30000)
		});
		
		if (response.ok) {
			const data = await response.json();
			return data.results || [];
		}
	} catch (error) {
		console.error('[API] AI analysis failed:', error);
	}
	
	// Return default scores
	return headlines.map(() => ({ significance: 5, summary: '' }));
}

