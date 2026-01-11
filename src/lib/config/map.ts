// Map configuration - hotspots, conflict zones, and strategic locations

export interface Hotspot {
	name: string;
	lat: number;
	lon: number;
	level: 'critical' | 'high' | 'elevated' | 'low';
	desc: string;
	emergentScore?: number; // 1-100 emergent situation score
	region?: string;
	reasons?: string[]; // Factors contributing to the threat level
}

export interface ScoreBreakdown {
	baseScore: number;
	volatilityModifier: number;
	finalScore: number;
	factors: ScoreFactor[];
}

export interface ScoreFactor {
	name: string;
	impact: 'positive' | 'negative' | 'neutral';
	weight: number; // -20 to +20
	description: string;
}

export interface ConflictZone {
	name: string;
	coords: [number, number][];
	color: string;
	emergentScore?: number;
}

export interface Chokepoint {
	name: string;
	lat: number;
	lon: number;
	desc: string;
}

export interface CableLanding {
	name: string;
	lat: number;
	lon: number;
	desc: string;
}

export interface NuclearSite {
	name: string;
	lat: number;
	lon: number;
	desc: string;
}

export interface MilitaryBase {
	name: string;
	lat: number;
	lon: number;
	desc: string;
}

export interface Ocean {
	name: string;
	lat: number;
	lon: number;
}

/**
 * Calculate emergent score (1-100) based on threat level
 * Formula: critical=85-100, high=60-84, elevated=35-59, low=1-34
 */
export function calculateEmergentScore(level: Hotspot['level'], volatility = 0.5): number {
	const baseScores: Record<Hotspot['level'], [number, number]> = {
		critical: [85, 100],
		high: [60, 84],
		elevated: [35, 59],
		low: [1, 34]
	};
	const [min, max] = baseScores[level];
	// Add some variance based on volatility (0-1)
	const range = max - min;
	return Math.round(min + range * volatility);
}

/**
 * Calculate detailed score breakdown with contributing factors
 */
export function calculateScoreBreakdown(hotspot: Hotspot): ScoreBreakdown {
	const baseScores: Record<Hotspot['level'], number> = {
		critical: 90,
		high: 70,
		elevated: 45,
		low: 20
	};

	const baseScore = baseScores[hotspot.level];
	const factors: ScoreFactor[] = [];

	// Generate factors based on hotspot properties
	if (hotspot.level === 'critical') {
		factors.push({
			name: 'Active Conflict',
			impact: 'negative',
			weight: 15,
			description: 'Ongoing military operations or major crisis'
		});
	}

	if (hotspot.desc.toLowerCase().includes('nuclear')) {
		factors.push({
			name: 'Nuclear Risk',
			impact: 'negative',
			weight: 10,
			description: 'Nuclear weapons or program involvement'
		});
	}

	if (hotspot.desc.toLowerCase().includes('sanction')) {
		factors.push({
			name: 'Under Sanctions',
			impact: 'negative',
			weight: 8,
			description: 'International economic sanctions in effect'
		});
	}

	if (hotspot.desc.toLowerCase().includes('humanitarian') || hotspot.desc.toLowerCase().includes('crisis')) {
		factors.push({
			name: 'Humanitarian Crisis',
			impact: 'negative',
			weight: 12,
			description: 'Significant civilian population at risk'
		});
	}

	if (hotspot.desc.toLowerCase().includes('nato') || hotspot.desc.toLowerCase().includes('ally')) {
		factors.push({
			name: 'Allied Territory',
			impact: 'positive',
			weight: -5,
			description: 'NATO or allied military presence'
		});
	}

	if (hotspot.desc.toLowerCase().includes('trade') || hotspot.desc.toLowerCase().includes('finance')) {
		factors.push({
			name: 'Economic Hub',
			impact: 'neutral',
			weight: 3,
			description: 'Major trade or financial center'
		});
	}

	if (hotspot.desc.toLowerCase().includes('uprising') || hotspot.desc.toLowerCase().includes('protest')) {
		factors.push({
			name: 'Civil Unrest',
			impact: 'negative',
			weight: 10,
			description: 'Large-scale protests or uprising'
		});
	}

	if (hotspot.desc.toLowerCase().includes('invasion') || hotspot.desc.toLowerCase().includes('occupied')) {
		factors.push({
			name: 'Foreign Occupation',
			impact: 'negative',
			weight: 15,
			description: 'Territory under foreign military control'
		});
	}

	const volatilityModifier = factors.reduce((sum, f) => sum + f.weight, 0);
	const finalScore = Math.max(1, Math.min(100, baseScore + volatilityModifier));

	return {
		baseScore,
		volatilityModifier,
		finalScore,
		factors
	};
}

/**
 * Get color for emergent score (gradient from green to red)
 */
export function getEmergentColor(score: number): string {
	if (score >= 85) return '#ff0000'; // Critical red
	if (score >= 70) return '#ff4444'; // High red
	if (score >= 55) return '#ff8800'; // Orange
	if (score >= 40) return '#ffcc00'; // Yellow
	if (score >= 25) return '#88cc00'; // Yellow-green
	return '#00ff88'; // Green
}

/**
 * Get label for emergent score
 */
export function getEmergentLabel(score: number): string {
	if (score >= 85) return 'CRITICAL';
	if (score >= 70) return 'HIGH';
	if (score >= 55) return 'ELEVATED';
	if (score >= 40) return 'MODERATE';
	if (score >= 25) return 'LOW';
	return 'STABLE';
}

export const THREAT_COLORS = {
	critical: '#ff0000',
	high: '#ff4444',
	elevated: '#ffcc00',
	low: '#00ff88'
} as const;

export const SANCTIONED_COUNTRY_IDS = [
	364, // Iran
	408, // North Korea
	760, // Syria
	862, // Venezuela
	112, // Belarus
	643, // Russia
	728, // South Sudan
	729 // Sudan
];

export const HOTSPOTS: Hotspot[] = [
	// NORTH AMERICA
	{
		name: 'DC',
		lat: 38.9,
		lon: -77.0,
		level: 'low',
		desc: 'Washington DC — US political center, White House, Pentagon, Capitol',
		reasons: ['Stable democratic institutions', 'Strong security apparatus', 'Economic stability']
	},
	{
		name: 'Seattle',
		lat: 47.61,
		lon: -122.33,
		level: 'low',
		desc: 'Seattle — Pacific Northwest port, cloud infra, naval & aerospace hub',
		reasons: ['Major tech industry hub', 'Naval base presence', 'Pacific trade gateway']
	},
	{
		name: 'New York',
		lat: 40.71,
		lon: -74.01,
		level: 'low',
		desc: 'New York — Global finance, UN headquarters, critical infrastructure',
		reasons: ['Global financial center', 'UN headquarters', 'Critical infrastructure target']
	},
	{
		name: 'Los Angeles',
		lat: 34.05,
		lon: -118.24,
		level: 'low',
		desc: 'Los Angeles — Pacific trade gateway, entertainment, defense industry',
		reasons: ['Largest US port complex', 'Defense aerospace hub', 'Entertainment industry center']
	},
	{
		name: 'Houston',
		lat: 29.76,
		lon: -95.37,
		level: 'low',
		desc: 'Houston — US energy capital, NASA, petrochemical hub',
		reasons: ['US energy sector HQ', 'NASA Johnson Space Center', 'Petrochemical corridor']
	},
	{
		name: 'Mexico City',
		lat: 19.43,
		lon: -99.13,
		level: 'low',
		desc: 'Mexico City — North American manufacturing, security and migration hub',
		reasons: ['USMCA manufacturing', 'Migration transit hub', 'Cartel activity in region']
	},
	{
		name: 'Miami',
		lat: 25.76,
		lon: -80.19,
		level: 'low',
		desc: 'Miami — Latin America gateway, banking, Caribbean security',
		reasons: ['Latin America finance gateway', 'Caribbean security operations', 'Climate vulnerability']
	},
	// SOUTH AMERICA
	{
		name: 'Caracas',
		lat: 10.5,
		lon: -66.9,
		level: 'high',
		desc: 'Caracas — Venezuela crisis, Maduro regime, US sanctions, humanitarian emergency',
		reasons: ['Authoritarian regime', 'Severe economic collapse', 'US sanctions', 'Mass emigration crisis', 'Russian/Chinese influence']
	},
	{
		name: 'Bogotá',
		lat: 4.71,
		lon: -74.07,
		level: 'elevated',
		desc: 'Bogotá — Colombia drug trafficking, FARC remnants, Venezuela border tensions',
		reasons: ['Drug cartel operations', 'FARC dissident groups', 'Venezuela border instability', 'Coca production increase']
	},
	{
		name: 'São Paulo',
		lat: -23.55,
		lon: -46.63,
		level: 'low',
		desc: 'São Paulo — South American finance, BRICS economy, regional power',
		reasons: ['BRICS economic weight', 'Largest South American city', 'Regional stability anchor']
	},
	{
		name: 'Buenos Aires',
		lat: -34.60,
		lon: -58.38,
		level: 'low',
		desc: 'Buenos Aires — Argentina economic instability, Falklands disputes',
		reasons: ['Chronic inflation crisis', 'IMF debt negotiations', 'Falklands sovereignty claim']
	},
	{
		name: 'Lima',
		lat: -12.05,
		lon: -77.04,
		level: 'elevated',
		desc: 'Lima — Peru political turmoil, mining, Pacific shipping lane',
		reasons: ['Frequent government turnover', 'Protest movements', 'Mining sector disputes', 'Pacific trade route']
	},
	// EUROPE
	{
		name: 'London',
		lat: 51.5,
		lon: -0.12,
		level: 'low',
		desc: 'London — Financial center, Five Eyes, NATO ally',
		reasons: ['Five Eyes intelligence', 'Global finance center', 'NATO founding member', 'Russian oligarch sanctions']
	},
	{
		name: 'Brussels',
		lat: 50.85,
		lon: 4.35,
		level: 'low',
		desc: 'Brussels — EU/NATO headquarters, European policy',
		reasons: ['EU headquarters', 'NATO HQ', 'European policy center', 'High-value target']
	},
	{
		name: 'Paris',
		lat: 48.86,
		lon: 2.35,
		level: 'low',
		desc: 'Paris — EU power, nuclear arsenal, UN Security Council',
		reasons: ['Nuclear arsenal', 'UN Security Council P5', 'EU leadership role', 'Terrorism target history']
	},
	{
		name: 'Berlin',
		lat: 52.52,
		lon: 13.41,
		level: 'low',
		desc: 'Berlin — EU economic engine, energy security, NATO logistics',
		reasons: ['EU economic leader', 'Energy transition challenges', 'Ukraine support logistics', 'Historical Cold War significance']
	},
	{
		name: 'Kyiv',
		lat: 50.45,
		lon: 30.5,
		level: 'critical',
		desc: 'Kyiv — Active conflict zone, Russian invasion ongoing, Western aid hub',
		reasons: ['Active Russian invasion since 2022', 'Daily missile/drone strikes', 'Western military aid hub', 'Civilian infrastructure targeting', 'Nuclear plant concerns']
	},
	{
		name: 'Moscow',
		lat: 55.75,
		lon: 37.6,
		level: 'elevated',
		desc: 'Moscow — Kremlin, Russian military command, sanctions hub',
		reasons: ['Directing Ukraine invasion', 'Under comprehensive sanctions', 'Nuclear arsenal control', 'Wagner Group aftermath', 'Economic isolation']
	},
	{
		name: 'Warsaw',
		lat: 52.23,
		lon: 21.01,
		level: 'elevated',
		desc: 'Warsaw — NATO eastern flank, Ukraine logistics, defense buildup',
		reasons: ['NATO frontline state', 'Ukraine weapons transit', 'Refugee influx', 'Russian threat proximity', 'Rapid military buildup']
	},
	{
		name: 'Bucharest',
		lat: 44.43,
		lon: 26.10,
		level: 'elevated',
		desc: 'Bucharest — Black Sea access, NATO base, Ukraine support',
		reasons: ['Black Sea NATO presence', 'Drone debris incidents', 'Ukraine grain transit', 'Russian naval threat']
	},
	{
		name: 'Istanbul',
		lat: 41.01,
		lon: 28.98,
		level: 'elevated',
		desc: 'Istanbul — Bosporus control, NATO member, Russia-Ukraine mediator',
		reasons: ['Bosporus Strait control', 'Grain deal mediator', 'NATO-Russia balancing', 'Regional power broker']
	},
	// MIDDLE EAST
	{
		name: 'Tehran',
		lat: 35.7,
		lon: 51.4,
		level: 'critical',
		desc: 'Tehran — ACTIVE UPRISING: 200+ cities, 26 provinces. Revolution protests, regime instability, nuclear program',
		reasons: ['Ongoing revolution protests', 'Nuclear enrichment escalation', 'Drone supplies to Russia', 'Regional proxy networks', 'Severe sanctions impact']
	},
	{
		name: 'Tel Aviv',
		lat: 32.07,
		lon: 34.78,
		level: 'high',
		desc: 'Tel Aviv — Israel-Gaza conflict, active military operations',
		reasons: ['Gaza military operations', 'Hezbollah northern front', 'West Bank tensions', 'Iran threat escalation', 'Regional conflict risk']
	},
	{
		name: 'Riyadh',
		lat: 24.7,
		lon: 46.7,
		level: 'elevated',
		desc: 'Riyadh — Saudi oil, OPEC+, Yemen conflict, regional power',
		reasons: ['OPEC+ oil production control', 'Yemen war involvement', 'Iran rivalry', 'Vision 2030 transition', 'Regional realignment']
	},
	{
		name: 'Dubai',
		lat: 25.20,
		lon: 55.27,
		level: 'low',
		desc: 'Dubai — Gulf finance hub, sanctions evasion risk, trade node',
		reasons: ['Sanctions evasion hub', 'Global trade node', 'Russian money flows', 'Regional stability']
	},
	{
		name: 'Baghdad',
		lat: 33.31,
		lon: 44.37,
		level: 'elevated',
		desc: 'Baghdad — Iran influence, militia activity, oil infrastructure',
		reasons: ['Iran-backed militias', 'US base attacks', 'Oil infrastructure', 'ISIS remnants', 'Political instability']
	},
	{
		name: 'Beirut',
		lat: 33.89,
		lon: 35.50,
		level: 'high',
		desc: 'Beirut — Hezbollah stronghold, economic collapse, Israel tensions',
		reasons: ['Hezbollah military buildup', 'Complete economic collapse', 'Israel border clashes', 'Government paralysis', 'Syrian refugee burden']
	},
	{
		name: 'Damascus',
		lat: 33.51,
		lon: 36.29,
		level: 'high',
		desc: 'Damascus — Syrian civil war aftermath, Russian/Iranian presence',
		reasons: ['Russian military bases', 'Iranian entrenchment', 'Israeli airstrikes', 'Humanitarian crisis', 'Reconstruction stalled']
	},
	{
		name: 'Sanaa',
		lat: 15.35,
		lon: 44.21,
		level: 'high',
		desc: 'Sanaa — Houthi control, Yemen war, Red Sea attacks',
		reasons: ['Houthi Red Sea attacks', 'Shipping lane disruption', 'Iran weapons supply', 'Humanitarian catastrophe', 'Saudi coalition operations']
	},
	// AFRICA
	{
		name: 'Lagos',
		lat: 6.46,
		lon: 3.39,
		level: 'low',
		desc: 'Lagos — West Africa finance, shipping, energy and security flashpoints',
		reasons: ['West Africa economic hub', 'Oil production center', 'Regional security anchor', 'Climate migration pressure']
	},
	{
		name: 'Cairo',
		lat: 30.04,
		lon: 31.24,
		level: 'elevated',
		desc: 'Cairo — Suez gateway, regional mediator, economic pressures',
		reasons: ['Suez Canal control', 'Gaza mediation role', 'Economic crisis/IMF deals', 'Regional military power']
	},
	{
		name: 'Addis Ababa',
		lat: 9.03,
		lon: 38.74,
		level: 'elevated',
		desc: 'Addis Ababa — African Union HQ, Tigray aftermath, Horn instability',
		reasons: ['African Union headquarters', 'Post-Tigray reconstruction', 'Ethiopia-Eritrea tensions', 'Grand Renaissance Dam dispute']
	},
	{
		name: 'Khartoum',
		lat: 15.50,
		lon: 32.56,
		level: 'critical',
		desc: 'Khartoum — Sudan civil war, humanitarian crisis, regional spillover',
		reasons: ['Active civil war RSF vs SAF', 'Mass displacement crisis', 'Famine conditions', 'Regional destabilization', 'Wagner Group involvement']
	},
	{
		name: 'Nairobi',
		lat: -1.29,
		lon: 36.82,
		level: 'low',
		desc: 'Nairobi — East Africa hub, UN presence, regional stability anchor',
		reasons: ['UN regional headquarters', 'East Africa finance center', 'Somalia border security', 'Regional diplomacy hub']
	},
	{
		name: 'Cape Town',
		lat: -33.92,
		lon: 18.42,
		level: 'low',
		desc: 'Cape Town — Southern Africa shipping, energy, BRICS member',
		reasons: ['BRICS member state', 'Cape shipping route', 'Energy crisis management', 'Regional stability']
	},
	{
		name: 'Kinshasa',
		lat: -4.44,
		lon: 15.27,
		level: 'elevated',
		desc: 'Kinshasa — DRC conflict, rare minerals, M23 rebel activity',
		reasons: ['M23 rebel insurgency', 'Critical mineral mining', 'Rwanda tensions', 'UN peacekeeping mission', 'Humanitarian access issues']
	},
	// ASIA
	{
		name: 'Beijing',
		lat: 39.9,
		lon: 116.4,
		level: 'elevated',
		desc: 'Beijing — CCP headquarters, US-China tensions, tech rivalry',
		reasons: ['US-China strategic competition', 'Tech export controls', 'Taiwan ambitions', 'South China Sea claims', 'Economic slowdown']
	},
	{
		name: 'Shanghai',
		lat: 31.23,
		lon: 121.47,
		level: 'low',
		desc: 'Shanghai — China trade gateway, finance, supply chain node',
		reasons: ['Global supply chain hub', 'Financial center', 'Trade volume metrics', 'COVID policy aftermath']
	},
	{
		name: 'Hong Kong',
		lat: 22.32,
		lon: 114.17,
		level: 'elevated',
		desc: 'Hong Kong — Pro-democracy crackdown, finance hub, autonomy erosion',
		reasons: ['National Security Law', 'Autonomy erosion', 'Press freedom decline', 'Financial hub status at risk', 'Emigration wave']
	},
	{
		name: 'Taipei',
		lat: 25.03,
		lon: 121.5,
		level: 'elevated',
		desc: 'Taipei — Taiwan Strait tensions, TSMC, China threat',
		reasons: ['China invasion threat', 'TSMC semiconductor monopoly', 'US defense commitments', 'PLA military exercises', 'Global chip supply risk']
	},
	{
		name: 'Tokyo',
		lat: 35.68,
		lon: 139.76,
		level: 'low',
		desc: 'Tokyo — US ally, regional security, economic power',
		reasons: ['US-Japan alliance', 'Regional security anchor', 'Defense spending increase', 'North Korea threat response']
	},
	{
		name: 'Seoul',
		lat: 37.57,
		lon: 126.98,
		level: 'elevated',
		desc: 'Seoul — North Korea threat, US forces, semiconductor hub',
		reasons: ['North Korea nuclear threat', 'US military presence', 'Semiconductor production', 'China trade dependence', 'Japan relations']
	},
	{
		name: 'Pyongyang',
		lat: 39.03,
		lon: 125.75,
		level: 'high',
		desc: 'Pyongyang — North Korea nuclear threat, ICBM tests, Russia ties',
		reasons: ['Nuclear weapons program', 'ICBM development', 'Russia arms deals', 'Sanctions evasion', 'Regime instability risk']
	},
	{
		name: 'Delhi',
		lat: 28.6,
		lon: 77.2,
		level: 'low',
		desc: 'Delhi — India rising power, China border tensions',
		reasons: ['China border standoff', 'Rising global power', 'Regional leadership', 'BRICS member', 'Defense modernization']
	},
	{
		name: 'Mumbai',
		lat: 19.08,
		lon: 72.88,
		level: 'low',
		desc: 'Mumbai — India finance hub, naval power, terrorism target',
		reasons: ['Financial center', 'Naval base presence', 'Terrorism vulnerability', 'Economic growth engine']
	},
	{
		name: 'Islamabad',
		lat: 33.69,
		lon: 73.06,
		level: 'elevated',
		desc: 'Islamabad — Pakistan nuclear state, Afghanistan border, India tensions',
		reasons: ['Nuclear arsenal', 'Afghanistan Taliban ties', 'India Kashmir conflict', 'Political instability', 'Economic crisis']
	},
	{
		name: 'Kabul',
		lat: 34.53,
		lon: 69.17,
		level: 'high',
		desc: 'Kabul — Taliban rule, ISIS-K threat, humanitarian crisis',
		reasons: ['Taliban government', 'ISIS-K attacks', 'Women rights collapse', 'Economic collapse', 'Refugee crisis']
	},
	{
		name: 'Singapore',
		lat: 1.35,
		lon: 103.82,
		level: 'low',
		desc: 'Singapore — Shipping chokepoint, Asian finance hub',
		reasons: ['Malacca Strait control', 'Asian finance hub', 'US naval access', 'Regional stability']
	},
	{
		name: 'Bangkok',
		lat: 13.76,
		lon: 100.50,
		level: 'low',
		desc: 'Bangkok — Southeast Asia hub, tourism, Mekong politics',
		reasons: ['ASEAN member', 'Mekong River politics', 'Military influence', 'Myanmar refugee inflow']
	},
	{
		name: 'Manila',
		lat: 14.60,
		lon: 120.98,
		level: 'elevated',
		desc: 'Manila — South China Sea disputes, US alliance, China pressure',
		reasons: ['South China Sea confrontations', 'Renewed US alliance', 'China coercion', 'Strategic location']
	},
	{
		name: 'Jakarta',
		lat: -6.21,
		lon: 106.85,
		level: 'low',
		desc: 'Jakarta — Largest Muslim nation, ASEAN leader, maritime security',
		reasons: ['ASEAN leadership', 'Maritime security role', 'Capital relocation', 'Moderate Islam influence']
	},
	{
		name: 'Hanoi',
		lat: 21.03,
		lon: 105.85,
		level: 'low',
		desc: 'Hanoi — Vietnam manufacturing boom, South China Sea claimant',
		reasons: ['Manufacturing hub shift', 'South China Sea claims', 'US partnership growth', 'China balancing']
	},
	// RUSSIA & CENTRAL ASIA
	{
		name: 'Novosibirsk',
		lat: 55.03,
		lon: 82.93,
		level: 'elevated',
		desc: 'Novosibirsk — Siberian logistics node, rail corridor, energy hub',
		reasons: ['Trans-Siberian hub', 'Defense industry', 'Energy transit', 'Sanctions impact']
	},
	{
		name: 'Vladivostok',
		lat: 43.12,
		lon: 131.89,
		level: 'elevated',
		desc: 'Vladivostok — Russian Pacific Fleet, China border, North Korea link',
		reasons: ['Pacific Fleet base', 'North Korea supply route', 'China partnership', 'Sanctions workaround']
	},
	{
		name: 'Almaty',
		lat: 43.24,
		lon: 76.95,
		level: 'low',
		desc: 'Almaty — Kazakhstan finance, Belt & Road, Russia influence',
		reasons: ['Belt & Road transit', 'Russia influence zone', 'Energy production', 'Regional stability']
	},
	// OCEANIA
	{
		name: 'Sydney',
		lat: -33.87,
		lon: 151.21,
		level: 'low',
		desc: 'Sydney — Pacific naval access, AUS-US alliance, finance and ports',
		reasons: ['AUKUS partnership', 'Indo-Pacific anchor', 'Pacific island influence', 'China competition']
	},
	{
		name: 'Canberra',
		lat: -35.28,
		lon: 149.13,
		level: 'low',
		desc: 'Canberra — AUKUS alliance, Five Eyes, Indo-Pacific strategy',
		reasons: ['AUKUS nuclear subs', 'Five Eyes intel', 'Defense spending surge', 'China relationship strain']
	},
	// ARCTIC
	{
		name: 'Nuuk',
		lat: 64.18,
		lon: -51.72,
		level: 'elevated',
		desc: 'Nuuk — Greenland, US acquisition interest, Arctic strategy, Denmark tensions',
		reasons: ['US strategic interest', 'Rare earth deposits', 'Arctic shipping routes', 'Climate change access', 'Denmark sovereignty']
	},
	{
		name: 'Murmansk',
		lat: 68.97,
		lon: 33.09,
		level: 'elevated',
		desc: 'Murmansk — Russian Northern Fleet, Arctic militarization, nuclear subs',
		reasons: ['Northern Fleet base', 'Nuclear submarine port', 'Arctic militarization', 'NATO proximity', 'Northern Sea Route']
	}
];

export const CONFLICT_ZONES: ConflictZone[] = [
	{
		name: 'Ukraine',
		coords: [
			[30, 52],
			[40, 52],
			[40, 45],
			[30, 45],
			[30, 52]
		],
		color: '#ff4444'
	},
	{
		name: 'Gaza',
		coords: [
			[34, 32],
			[35, 32],
			[35, 31],
			[34, 31],
			[34, 32]
		],
		color: '#ff4444'
	},
	{
		name: 'Taiwan Strait',
		coords: [
			[117, 28],
			[122, 28],
			[122, 22],
			[117, 22],
			[117, 28]
		],
		color: '#ffaa00'
	},
	{
		name: 'Yemen',
		coords: [
			[42, 19],
			[54, 19],
			[54, 12],
			[42, 12],
			[42, 19]
		],
		color: '#ff6644'
	},
	{
		name: 'Sudan',
		coords: [
			[22, 23],
			[38, 23],
			[38, 8],
			[22, 8],
			[22, 23]
		],
		color: '#ff6644'
	},
	{
		name: 'Myanmar',
		coords: [
			[92, 28],
			[101, 28],
			[101, 10],
			[92, 10],
			[92, 28]
		],
		color: '#ff8844'
	}
];

export const CHOKEPOINTS: Chokepoint[] = [
	{
		name: 'Suez',
		lat: 30.0,
		lon: 32.5,
		desc: 'Suez Canal — 12% of global trade, Europe-Asia route'
	},
	{
		name: 'Panama',
		lat: 9.1,
		lon: -79.7,
		desc: 'Panama Canal — Americas transit, Pacific-Atlantic link'
	},
	{
		name: 'Hormuz',
		lat: 26.5,
		lon: 56.5,
		desc: 'Strait of Hormuz — 21% of global oil, Persian Gulf exit'
	},
	{
		name: 'Malacca',
		lat: 2.5,
		lon: 101.0,
		desc: 'Strait of Malacca — 25% of global trade, China supply line'
	},
	{
		name: 'Bab el-M',
		lat: 12.5,
		lon: 43.3,
		desc: 'Bab el-Mandeb — Red Sea gateway, Houthi threat zone'
	},
	{ name: 'Gibraltar', lat: 36.0, lon: -5.5, desc: 'Strait of Gibraltar — Mediterranean access' },
	{
		name: 'Bosporus',
		lat: 41.1,
		lon: 29.0,
		desc: 'Bosporus Strait — Black Sea access, Russia exports'
	}
];

export const CABLE_LANDINGS: CableLanding[] = [
	{ name: 'NYC', lat: 40.7, lon: -74.0, desc: 'New York — Transatlantic hub, 10+ cables' },
	{ name: 'Cornwall', lat: 50.1, lon: -5.5, desc: 'Cornwall UK — Europe-Americas gateway' },
	{ name: 'Marseille', lat: 43.3, lon: 5.4, desc: 'Marseille — Mediterranean hub, SEA-ME-WE' },
	{ name: 'Mumbai', lat: 19.1, lon: 72.9, desc: 'Mumbai — India gateway, 10+ cables' },
	{ name: 'Singapore', lat: 1.3, lon: 103.8, desc: 'Singapore — Asia-Pacific nexus' },
	{ name: 'Hong Kong', lat: 22.3, lon: 114.2, desc: 'Hong Kong — China connectivity hub' },
	{ name: 'Tokyo', lat: 35.5, lon: 139.8, desc: 'Tokyo — Trans-Pacific terminus' },
	{ name: 'Sydney', lat: -33.9, lon: 151.2, desc: 'Sydney — Australia/Pacific hub' },
	{ name: 'LA', lat: 33.7, lon: -118.2, desc: 'Los Angeles — Pacific gateway' },
	{ name: 'Miami', lat: 25.8, lon: -80.2, desc: 'Miami — Americas/Caribbean hub' }
];

export const NUCLEAR_SITES: NuclearSite[] = [
	{ name: 'Natanz', lat: 33.7, lon: 51.7, desc: 'Natanz — Iran uranium enrichment' },
	{ name: 'Yongbyon', lat: 39.8, lon: 125.8, desc: 'Yongbyon — North Korea nuclear complex' },
	{ name: 'Dimona', lat: 31.0, lon: 35.1, desc: 'Dimona — Israel nuclear facility' },
	{ name: 'Bushehr', lat: 28.8, lon: 50.9, desc: 'Bushehr — Iran nuclear power plant' },
	{
		name: 'Zaporizhzhia',
		lat: 47.5,
		lon: 34.6,
		desc: 'Zaporizhzhia — Europe largest NPP, conflict zone'
	},
	{ name: 'Chernobyl', lat: 51.4, lon: 30.1, desc: 'Chernobyl — Exclusion zone, occupied 2022' },
	{ name: 'Fukushima', lat: 37.4, lon: 141.0, desc: 'Fukushima — Decommissioning site' }
];

export const MILITARY_BASES: MilitaryBase[] = [
	{ name: 'Ramstein', lat: 49.4, lon: 7.6, desc: 'Ramstein — US Air Force, NATO hub Germany' },
	{
		name: 'Diego Garcia',
		lat: -7.3,
		lon: 72.4,
		desc: 'Diego Garcia — US/UK Indian Ocean base'
	},
	{
		name: 'Okinawa',
		lat: 26.5,
		lon: 127.9,
		desc: 'Okinawa — US Forces Japan, Pacific presence'
	},
	{ name: 'Guam', lat: 13.5, lon: 144.8, desc: 'Guam — US Pacific Command, bomber base' },
	{
		name: 'Djibouti',
		lat: 11.5,
		lon: 43.1,
		desc: 'Djibouti — US/China/France bases, Horn of Africa'
	},
	{ name: 'Qatar', lat: 25.1, lon: 51.3, desc: 'Al Udeid — US CENTCOM forward HQ' },
	{
		name: 'Kaliningrad',
		lat: 54.7,
		lon: 20.5,
		desc: 'Kaliningrad — Russian Baltic exclave, missiles'
	},
	{ name: 'Sevastopol', lat: 44.6, lon: 33.5, desc: 'Sevastopol — Russian Black Sea Fleet' },
	{
		name: 'Hainan',
		lat: 18.2,
		lon: 109.5,
		desc: 'Hainan — Chinese submarine base, South China Sea'
	}
];

export const OCEANS: Ocean[] = [
	{ name: 'ATLANTIC', lat: 25, lon: -40 },
	{ name: 'PACIFIC', lat: 0, lon: -150 },
	{ name: 'INDIAN', lat: -20, lon: 75 },
	{ name: 'ARCTIC', lat: 75, lon: 0 },
	{ name: 'SOUTHERN', lat: -60, lon: 0 }
];

export const WEATHER_CODES: Record<number, string> = {
	0: '☀️ Clear',
	1: '🌤️ Mostly clear',
	2: '⛅ Partly cloudy',
	3: '☁️ Overcast',
	45: '🌫️ Fog',
	48: '🌫️ Fog',
	51: '🌧️ Drizzle',
	53: '🌧️ Drizzle',
	55: '🌧️ Drizzle',
	61: '🌧️ Rain',
	63: '🌧️ Rain',
	65: '🌧️ Heavy rain',
	71: '🌨️ Snow',
	73: '🌨️ Snow',
	75: '🌨️ Heavy snow',
	77: '🌨️ Snow',
	80: '🌧️ Showers',
	81: '🌧️ Showers',
	82: '⛈️ Heavy showers',
	85: '🌨️ Snow',
	86: '🌨️ Snow',
	95: '⛈️ Thunderstorm',
	96: '⛈️ Thunderstorm',
	99: '⛈️ Thunderstorm'
};
