/**
 * Markets API endpoint
 * GET /api/markets - Returns all market data
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Market data cache
interface MarketCache {
	crypto: CryptoItem[];
	indices: MarketItem[];
	commodities: MarketItem[];
	sectors: SectorItem[];
	lastUpdated: number;
}

interface CryptoItem {
	id: string;
	symbol: string;
	name: string;
	current_price: number;
	price_change_percentage_24h: number;
}

interface MarketItem {
	symbol: string;
	name: string;
	price: number;
	change: number;
	changePercent: number;
}

interface SectorItem {
	symbol: string;
	name: string;
	changePercent: number;
}

let marketCache: MarketCache = {
	crypto: [],
	indices: [],
	commodities: [],
	sectors: [],
	lastUpdated: 0
};

// Crypto IDs for CoinGecko
const CRYPTO_IDS = ['bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot', 'chainlink', 'avalanche-2'];

// Fetch crypto prices from CoinGecko
async function fetchCrypto(): Promise<CryptoItem[]> {
	try {
		const ids = CRYPTO_IDS.join(',');
		const response = await fetch(
			`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
			{
				headers: {
					'Accept': 'application/json'
				},
				signal: AbortSignal.timeout(10000)
			}
		);
		
		if (!response.ok) {
			throw new Error(`CoinGecko API error: ${response.status}`);
		}
		
		const data = await response.json();
		
		return CRYPTO_IDS.map(id => ({
			id,
			symbol: id.toUpperCase().slice(0, 3),
			name: id.charAt(0).toUpperCase() + id.slice(1),
			current_price: data[id]?.usd || 0,
			price_change_percentage_24h: data[id]?.usd_24h_change || 0
		}));
	} catch (error) {
		console.error('[Markets API] Crypto fetch error:', error);
		return [];
	}
}

// Fetch commodities from Open Data sources
async function fetchCommodities(): Promise<MarketItem[]> {
	// Using free commodity data - could integrate with Quandl, Alpha Vantage, etc.
	// For now, return structured placeholders
	return [
		{ symbol: 'GC=F', name: 'Gold', price: 0, change: 0, changePercent: 0 },
		{ symbol: 'SI=F', name: 'Silver', price: 0, change: 0, changePercent: 0 },
		{ symbol: 'CL=F', name: 'Crude Oil', price: 0, change: 0, changePercent: 0 },
		{ symbol: 'NG=F', name: 'Natural Gas', price: 0, change: 0, changePercent: 0 },
		{ symbol: 'HG=F', name: 'Copper', price: 0, change: 0, changePercent: 0 }
	];
}

// Fetch major indices
async function fetchIndices(): Promise<MarketItem[]> {
	// Would need Yahoo Finance API, Alpha Vantage, or similar
	// Returning structure for frontend to handle
	return [
		{ symbol: '^GSPC', name: 'S&P 500', price: 0, change: 0, changePercent: 0 },
		{ symbol: '^DJI', name: 'Dow Jones', price: 0, change: 0, changePercent: 0 },
		{ symbol: '^IXIC', name: 'NASDAQ', price: 0, change: 0, changePercent: 0 },
		{ symbol: '^VIX', name: 'VIX', price: 0, change: 0, changePercent: 0 }
	];
}

// Refresh all market data
async function refreshMarkets(): Promise<void> {
	const [crypto, commodities, indices] = await Promise.all([
		fetchCrypto(),
		fetchCommodities(),
		fetchIndices()
	]);
	
	marketCache = {
		crypto,
		commodities,
		indices,
		sectors: [],
		lastUpdated: Date.now()
	};
}

export const GET: RequestHandler = async ({ url }) => {
	const forceRefresh = url.searchParams.get('refresh') === 'true';
	const cacheAge = Date.now() - marketCache.lastUpdated;
	
	// Refresh if cache is older than 1 minute or forced
	if (forceRefresh || cacheAge > 60000) {
		await refreshMarkets();
	}
	
	return json({
		...marketCache,
		cacheAge: Date.now() - marketCache.lastUpdated
	});
};

export const POST: RequestHandler = async () => {
	await refreshMarkets();
	return json({ success: true, message: 'Markets refreshed' });
};
