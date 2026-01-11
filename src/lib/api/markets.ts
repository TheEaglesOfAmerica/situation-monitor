/**
 * Markets API - Fetches market data from server API
 */

import { CRYPTO } from '$lib/config/markets';
import type { MarketItem, SectorPerformance, CryptoItem } from '$lib/types';
import { logger } from '$lib/config/api';

interface ServerMarketData {
	crypto: { id: string; symbol: string; name: string; current_price: number; price_change_percentage_24h: number }[];
	indices: { symbol: string; name: string; price: number; change: number; changePercent: number }[];
	commodities: { symbol: string; name: string; price: number; change: number; changePercent: number }[];
	sectors: { symbol: string; name: string; changePercent: number }[];
	lastUpdated: number;
}

/**
 * Fetch all market data from server
 */
async function fetchServerMarkets(): Promise<ServerMarketData | null> {
	try {
		const response = await fetch('/api/markets');
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		return await response.json();
	} catch (error) {
		logger.error('Markets API', 'Error fetching from server:', error);
		return null;
	}
}

/**
 * Fetch crypto prices
 */
export async function fetchCryptoPrices(): Promise<CryptoItem[]> {
	const data = await fetchServerMarkets();
	
	if (data?.crypto && data.crypto.length > 0) {
		return data.crypto.map(c => ({
			id: c.id,
			symbol: c.symbol,
			name: c.name,
			current_price: c.current_price,
			price_change_24h: c.price_change_percentage_24h,
			price_change_percentage_24h: c.price_change_percentage_24h
		}));
	}
	
	// Fallback to empty data
	return CRYPTO.map((c) => ({
		id: c.id,
		symbol: c.symbol,
		name: c.name,
		current_price: 0,
		price_change_24h: 0,
		price_change_percentage_24h: 0
	}));
}

/**
 * Fetch market indices
 */
export async function fetchIndices(): Promise<MarketItem[]> {
	const data = await fetchServerMarkets();
	
	if (data?.indices) {
		return data.indices.map(i => ({
			symbol: i.symbol,
			name: i.name,
			price: i.price,
			change: i.change,
			changePercent: i.changePercent,
			type: 'index' as const
		}));
	}
	
	return [];
}

/**
 * Fetch sector performance
 */
export async function fetchSectorPerformance(): Promise<SectorPerformance[]> {
	const data = await fetchServerMarkets();
	
	if (data?.sectors) {
		return data.sectors.map(s => ({
			symbol: s.symbol,
			name: s.name,
			price: 0,
			change: 0,
			changePercent: s.changePercent
		}));
	}
	
	return [];
}

/**
 * Fetch commodities
 */
export async function fetchCommodities(): Promise<MarketItem[]> {
	const data = await fetchServerMarkets();
	
	if (data?.commodities) {
		return data.commodities.map(c => ({
			symbol: c.symbol,
			name: c.name,
			price: c.price,
			change: c.change,
			changePercent: c.changePercent,
			type: 'commodity' as const
		}));
	}
	
	return [];
}

/**
 * Fetch all market data
 */
export async function fetchAllMarkets() {
	const data = await fetchServerMarkets();
	
	if (data) {
		return {
			crypto: data.crypto.map(c => ({
				id: c.id,
				symbol: c.symbol,
				name: c.name,
				current_price: c.current_price,
				price_change_24h: c.price_change_percentage_24h,
				price_change_percentage_24h: c.price_change_percentage_24h
			})),
			indices: data.indices.map(i => ({
				symbol: i.symbol,
				name: i.name,
				price: i.price,
				change: i.change,
				changePercent: i.changePercent,
				type: 'index' as const
			})),
			sectors: data.sectors.map(s => ({
				symbol: s.symbol,
				name: s.name,
				price: 0,
				change: 0,
				changePercent: s.changePercent
			})),
			commodities: data.commodities.map(c => ({
				symbol: c.symbol,
				name: c.name,
				price: c.price,
				change: c.change,
				changePercent: c.changePercent,
				type: 'commodity' as const
			}))
		};
	}
	
	// Fallback
	return {
		crypto: CRYPTO.map(c => ({
			id: c.id,
			symbol: c.symbol,
			name: c.name,
			current_price: 0,
			price_change_24h: 0,
			price_change_percentage_24h: 0
		})),
		indices: [],
		sectors: [],
		commodities: []
	};
}
