/**
 * API Configuration
 */

// Check if we're in a browser environment
const browser = typeof window !== 'undefined';

/**
 * Check if we're in development mode
 * Uses import.meta.env which is available in both browser and test environments
 */
const isDev = browser ? ((import.meta as any).env?.DEV ?? false) : false;

/**
 * CORS proxy URL for external API requests
 */
export const CORS_PROXY_URL = 'https://situation-monitor-proxy.seanthielen-e.workers.dev/?url=';

/**
 * API request delays (ms) to avoid rate limiting
 */
export const API_DELAYS = {
	betweenCategories: 500,
	betweenRetries: 1000
} as const;

/**
 * Cache TTLs (ms)
 */
export const CACHE_TTLS = {
	weather: 10 * 60 * 1000, // 10 minutes
	news: 5 * 60 * 1000, // 5 minutes
	markets: 60 * 1000, // 1 minute
	default: 5 * 60 * 1000 // 5 minutes
} as const;

/**
 * Debug/logging configuration
 */
export const DEBUG = {
	enabled: isDev,
	logApiCalls: isDev,
	logCacheHits: false
} as const;

/**
 * Conditional logger - only logs in development
 */
export const logger = {
	log: (prefix: string, ...args: unknown[]) => {
		if (DEBUG.logApiCalls) {
			console.log(`[${prefix}]`, ...args);
		}
	},
	warn: (prefix: string, ...args: unknown[]) => {
		console.warn(`[${prefix}]`, ...args);
	},
	error: (prefix: string, ...args: unknown[]) => {
		console.error(`[${prefix}]`, ...args);
	}
};
