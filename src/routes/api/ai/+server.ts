/**
 * AI Analysis API endpoint
 * POST /api/ai/analyze - Analyze headlines with AI
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { analyzeWithAI } from '$lib/server/news-scraper';
import { getAiAnalysis, setAiAnalysis } from '$lib/server/news-store';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { headlines } = await request.json();
		
		if (!Array.isArray(headlines) || headlines.length === 0) {
			return json({ error: 'Headlines array required' }, { status: 400 });
		}
		
		// Check cache first
		const results: { significance: number; summary: string; cached: boolean }[] = [];
		const uncachedHeadlines: { index: number; headline: string }[] = [];
		
		headlines.forEach((headline: string, index: number) => {
			const cached = getAiAnalysis(headline);
			if (cached) {
				results[index] = { ...cached, cached: true };
			} else {
				uncachedHeadlines.push({ index, headline });
			}
		});
		
		// Analyze uncached headlines
		if (uncachedHeadlines.length > 0) {
			const analyses = await analyzeWithAI(uncachedHeadlines.map(h => h.headline));
			
			uncachedHeadlines.forEach((h, i) => {
				const analysis = analyses[i];
				setAiAnalysis(h.headline, analysis.significance, analysis.summary);
				results[h.index] = { ...analysis, cached: false };
			});
		}
		
		return json({
			success: true,
			results,
			cached: uncachedHeadlines.length === 0
		});
	} catch (error) {
		console.error('[AI API] Error:', error);
		return json({ error: 'Analysis failed' }, { status: 500 });
	}
};
