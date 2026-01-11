/**
 * Miscellaneous API - fetches from server API endpoints
 * Server handles external API calls and caching
 */

export interface Prediction {
	id: string;
	question: string;
	yes: number;
	volume: string;
}

export interface WhaleTransaction {
	coin: string;
	amount: number;
	usd: number;
	hash: string;
}

export interface Contract {
	agency: string;
	description: string;
	vendor: string;
	amount: number;
}

export interface Layoff {
	company: string;
	count: number;
	title: string;
	date: string;
}

/**
 * Fetch all misc data from server
 */
async function fetchMiscData(): Promise<{
	predictions: Prediction[];
	whales: WhaleTransaction[];
	contracts: Contract[];
	layoffs: Layoff[];
}> {
	try {
		const response = await fetch('/api/data');
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		return await response.json();
	} catch (error) {
		console.error('Error fetching misc data:', error);
		return {
			predictions: [],
			whales: [],
			contracts: [],
			layoffs: []
		};
	}
}

/**
 * Fetch Polymarket predictions
 */
export async function fetchPolymarket(): Promise<Prediction[]> {
	const data = await fetchMiscData();
	return data.predictions;
}

/**
 * Fetch whale transactions
 */
export async function fetchWhaleTransactions(): Promise<WhaleTransaction[]> {
	const data = await fetchMiscData();
	return data.whales;
}

/**
 * Fetch government contracts
 */
export async function fetchGovContracts(): Promise<Contract[]> {
	const data = await fetchMiscData();
	return data.contracts;
}

/**
 * Fetch layoffs data
 */
export async function fetchLayoffs(): Promise<Layoff[]> {
	const data = await fetchMiscData();
	return data.layoffs;
}
