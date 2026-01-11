/**
 * AI-powered notifications service
 * Uses Mistral 8B via OpenRouter to analyze headlines for significance
 */

import type { NewsItem } from '$lib/types';

// Check if we're in a browser environment
const browser = typeof window !== 'undefined';

// OpenRouter API configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = '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';
const MODEL = 'mistralai/ministral-8b';

// Storage keys
const NOTIFICATION_ENABLED_KEY = 'notificationsEnabled';
const NOTIFICATION_SOUND_KEY = 'notificationSoundEnabled';
const SEEN_HEADLINES_KEY = 'seenHeadlines';

// Track seen headlines to avoid duplicate notifications
let seenHeadlines = new Set<string>();

// Load seen headlines from localStorage
function loadSeenHeadlines(): void {
	if (!browser) return;
	try {
		const saved = localStorage.getItem(SEEN_HEADLINES_KEY);
		if (saved) {
			const arr = JSON.parse(saved) as string[];
			seenHeadlines = new Set(arr.slice(-500)); // Keep last 500
		}
	} catch {
		seenHeadlines = new Set();
	}
}

// Save seen headlines to localStorage
function saveSeenHeadlines(): void {
	if (!browser) return;
	try {
		const arr = Array.from(seenHeadlines).slice(-500);
		localStorage.setItem(SEEN_HEADLINES_KEY, JSON.stringify(arr));
	} catch {
		// Ignore storage errors
	}
}

// Check if notifications are enabled
export function isNotificationsEnabled(): boolean {
	if (!browser) return false;
	return localStorage.getItem(NOTIFICATION_ENABLED_KEY) === 'true';
}

// Check if notification sound is enabled
export function isSoundEnabled(): boolean {
	if (!browser) return true;
	return localStorage.getItem(NOTIFICATION_SOUND_KEY) !== 'false';
}

// Toggle notifications
export function toggleNotifications(): boolean {
	if (!browser) return false;
	const current = isNotificationsEnabled();
	localStorage.setItem(NOTIFICATION_ENABLED_KEY, (!current).toString());
	return !current;
}

// Toggle sound
export function toggleSound(): boolean {
	if (!browser) return true;
	const current = isSoundEnabled();
	localStorage.setItem(NOTIFICATION_SOUND_KEY, (!current).toString());
	return !current;
}

// Request notification permission
export async function requestNotificationPermission(): Promise<boolean> {
	if (!browser || !('Notification' in window)) return false;
	
	if (Notification.permission === 'granted') return true;
	if (Notification.permission === 'denied') return false;
	
	const result = await Notification.requestPermission();
	return result === 'granted';
}

// Play notification sound
function playNotificationSound(): void {
	if (!isSoundEnabled()) return;
	try {
		// Create a simple beep using Web Audio API
		const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
		const oscillator = audioContext.createOscillator();
		const gainNode = audioContext.createGain();
		
		oscillator.connect(gainNode);
		gainNode.connect(audioContext.destination);
		
		oscillator.frequency.value = 800;
		oscillator.type = 'sine';
		gainNode.gain.value = 0.1;
		
		oscillator.start();
		gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
		oscillator.stop(audioContext.currentTime + 0.3);
	} catch {
		// Audio not supported
	}
}

// Show browser notification
function showNotification(title: string, body: string, url?: string): void {
	if (!browser || !('Notification' in window)) return;
	if (Notification.permission !== 'granted') return;
	
	const notification = new Notification(title, {
		body,
		icon: '/favicon.ico',
		tag: 'situation-monitor',
		requireInteraction: false
	});
	
	playNotificationSound();
	
	if (url) {
		notification.onclick = () => {
			window.open(url, '_blank');
			notification.close();
		};
	}
	
	// Auto close after 10 seconds
	setTimeout(() => notification.close(), 10000);
}

// Analyze headlines with AI to determine significance
async function analyzeHeadlines(headlines: string[]): Promise<number[]> {
	try {
		const response = await fetch(OPENROUTER_API_URL, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': browser ? window.location.origin : 'https://situation-monitor.app',
				'X-Title': 'Situation Monitor'
			},
			body: JSON.stringify({
				model: MODEL,
				messages: [
					{
						role: 'system',
						content: `You are a geopolitical analyst. Rate each headline's significance from 1-10.
10 = Major breaking news (war declared, leader assassinated, major attack, nuclear event)
8-9 = Very significant (military action, major sanctions, diplomatic crisis)
6-7 = Notable (policy changes, significant protests, economic moves)
4-5 = Moderate interest (regular political news)
1-3 = Low significance (routine updates)

Respond with ONLY a JSON array of numbers, one for each headline. Example: [7, 3, 9, 4]`
					},
					{
						role: 'user',
						content: `Rate these headlines:\n${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
					}
				],
				max_tokens: 100,
				temperature: 0.1
			})
		});
		
		if (!response.ok) {
			console.error('[Notifications] OpenRouter API error:', response.status);
			return headlines.map(() => 5); // Default to moderate
		}
		
		const data = await response.json();
		const content = data.choices?.[0]?.message?.content || '[]';
		
		// Parse the JSON array from the response
		const match = content.match(/\[[\d,\s]+\]/);
		if (match) {
			const scores = JSON.parse(match[0]) as number[];
			return scores;
		}
		
		return headlines.map(() => 5);
	} catch (error) {
		console.error('[Notifications] AI analysis error:', error);
		return headlines.map(() => 5);
	}
}

// Process new headlines and send notifications for significant ones
export async function processHeadlines(newsItems: NewsItem[]): Promise<void> {
	if (!browser || !isNotificationsEnabled()) return;
	
	// Load seen headlines on first run
	if (seenHeadlines.size === 0) {
		loadSeenHeadlines();
	}
	
	// Filter to only new headlines
	const newItems = newsItems.filter(item => !seenHeadlines.has(item.id));
	if (newItems.length === 0) return;
	
	// Mark all as seen
	newItems.forEach(item => seenHeadlines.add(item.id));
	saveSeenHeadlines();
	
	// Only analyze first 10 new headlines to save API calls
	const toAnalyze = newItems.slice(0, 10);
	const headlines = toAnalyze.map(item => item.title);
	
	// Get significance scores from AI
	const scores = await analyzeHeadlines(headlines);
	
	// Send notifications for highly significant headlines (score >= 8)
	for (let i = 0; i < toAnalyze.length; i++) {
		if (scores[i] >= 8) {
			const item = toAnalyze[i];
			const urgency = scores[i] >= 9 ? '🚨 URGENT' : '⚠️ ALERT';
			showNotification(
				`${urgency}: ${item.source}`,
				item.title,
				item.link
			);
			
			// Small delay between notifications
			await new Promise(resolve => setTimeout(resolve, 500));
		}
	}
}

// Initialize notifications system
export function initNotifications(): void {
	if (!browser) return;
	loadSeenHeadlines();
}
