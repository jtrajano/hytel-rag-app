import { PlaceSearchResult } from '@/lib/schema/pollutionSchema'

export const STATIC_PLACES_DATA: PlaceSearchResult[] = [
  // ─── Manila, Philippines — AQI 158 (Unhealthy) ────────────────────────────
  {
    id: 'manila-ph',
    name: 'Manila',
    country: 'Philippines',
    flagEmoji: '🇵🇭',
    pollution: {
      aqi: 158,
      category: 'Unhealthy',
      pm25: 61.4,
      pm10: 89.2,
      o3: 42.1,
      no2: 38.7,
      updatedAt: '2026-02-18T06:42:00+08:00',
    },
    visitorGuidelines: [
      {
        id: 'vg-mn-1',
        text: 'Wear an N95 or KN95 mask when outdoors — surgical masks do not filter fine particles.',
      },
      {
        id: 'vg-mn-2',
        text: 'Limit outdoor activity to under 30 minutes; reschedule exercise to indoor venues.',
      },
      {
        id: 'vg-mn-3',
        text: 'Keep windows and doors closed; use an air purifier with HEPA filtration indoors.',
      },
      {
        id: 'vg-mn-4',
        text: 'Stay hydrated and avoid heavy meals near busy roads to reduce respiratory stress.',
      },
      {
        id: 'vg-mn-5',
        text: 'Children, elderly, and those with asthma should remain indoors until AQI drops below 100.',
      },
    ],
    preventionTips: [
      {
        id: 'pt-mn-1',
        text: 'Monitor the AQI hourly via this app before planning outdoor activities.',
      },
      {
        id: 'pt-mn-2',
        text: 'Use public transport or rideshare to reduce per-capita vehicle emissions.',
      },
      {
        id: 'pt-mn-3',
        text: 'Plant air-filtering indoor plants such as peace lilies and snake plants at home.',
      },
    ],
    improvementActions: [
      {
        id: 'ia-mn-1',
        text: 'Advocate for vehicle emission inspections at local government checkpoints.',
      },
      {
        id: 'ia-mn-2',
        text: 'Support open-burning bans for agricultural waste in surrounding provinces.',
      },
      {
        id: 'ia-mn-3',
        text: 'Participate in tree-planting programmes along major roads to form green buffers.',
      },
    ],
  },

  // ─── Jakarta, Indonesia — AQI 223 (Very Unhealthy) ────────────────────────
  {
    id: 'jakarta-id',
    name: 'Jakarta',
    country: 'Indonesia',
    flagEmoji: '🇮🇩',
    pollution: {
      aqi: 223,
      category: 'Very Unhealthy',
      pm25: 95.3,
      pm10: 142.1,
      o3: 51.8,
      no2: 58.2,
      updatedAt: '2026-02-18T06:42:00+07:00',
    },
    visitorGuidelines: [
      {
        id: 'vg-jk-1',
        text: 'Avoid all non-essential outdoor exposure; N95 mask is mandatory if you must go out.',
      },
      {
        id: 'vg-jk-2',
        text: 'Run air purifiers continuously in your accommodation on their highest HEPA setting.',
      },
      {
        id: 'vg-jk-3',
        text: 'Seek immediate medical attention if you experience chest tightness or difficulty breathing.',
      },
      {
        id: 'vg-jk-4',
        text: 'Close all ventilation gaps in hotel rooms with damp towels if purifiers are unavailable.',
      },
    ],
    preventionTips: [
      {
        id: 'pt-jk-1',
        text: 'Schedule all outdoor commitments for early morning (pre-5 AM) when traffic is minimal.',
      },
      {
        id: 'pt-jk-2',
        text: 'Use the AQI forecast feature to plan 72-hour travel windows.',
      },
    ],
    improvementActions: [
      {
        id: 'ia-jk-1',
        text: 'Support the transition to electric public buses in the Transjakarta fleet.',
      },
      {
        id: 'ia-jk-2',
        text: 'Report visible industrial smokestacks to KLHK via the SIPONGI reporting portal.',
      },
    ],
  },

  // ─── Bangkok, Thailand — AQI 82 (Moderate) ────────────────────────────────
  {
    id: 'bangkok-th',
    name: 'Bangkok',
    country: 'Thailand',
    flagEmoji: '🇹🇭',
    pollution: {
      aqi: 82,
      category: 'Moderate',
      pm25: 23.8,
      pm10: 48.5,
      o3: 35.4,
      no2: 24.1,
      updatedAt: '2026-02-18T06:42:00+07:00',
    },
    visitorGuidelines: [],
    preventionTips: [
      {
        id: 'pt-bk-1',
        text: 'Sensitive individuals (asthma, elderly) should carry a mask for crowded areas.',
      },
      {
        id: 'pt-bk-2',
        text: 'Prefer BTS Skytrain over tuk-tuks to minimise roadside exhaust exposure.',
      },
    ],
    improvementActions: [
      {
        id: 'ia-bk-1',
        text: "Support the Bangkok Metropolitan Administration's no-burn ordinance during dry season.",
      },
    ],
  },

  // ─── Singapore — AQI 42 (Good) ─────────────────────────────────────────────
  {
    id: 'singapore-sg',
    name: 'Singapore',
    country: 'Singapore',
    flagEmoji: '🇸🇬',
    pollution: {
      aqi: 42,
      category: 'Good',
      pm25: 8.2,
      pm10: 21.3,
      o3: 18.9,
      no2: 11.4,
      updatedAt: '2026-02-18T06:42:00+08:00',
    },
    visitorGuidelines: [],
    preventionTips: [
      {
        id: 'pt-sg-1',
        text: 'Air quality is good — great day for outdoor runs and cycling along park connectors.',
      },
    ],
    improvementActions: [
      {
        id: 'ia-sg-1',
        text: 'Continue reducing single-use plastics to lower incineration-based PM emissions.',
      },
    ],
  },

  // ─── Kuala Lumpur, Malaysia — AQI 118 (Unhealthy for Sensitive Groups) ─────
  {
    id: 'kuala-lumpur-my',
    name: 'Kuala Lumpur',
    country: 'Malaysia',
    flagEmoji: '🇲🇾',
    pollution: {
      aqi: 118,
      category: 'Unhealthy for Sensitive Groups',
      pm25: 41.2,
      pm10: 68.7,
      o3: 38.5,
      no2: 29.3,
      updatedAt: '2026-02-18T06:42:00+08:00',
    },
    visitorGuidelines: [
      {
        id: 'vg-kl-1',
        text: 'Sensitive groups (asthma, elderly, children) should wear a mask outdoors.',
      },
      {
        id: 'vg-kl-2',
        text: 'Reduce extended outdoor activity; short walks are generally manageable for healthy adults.',
      },
      {
        id: 'vg-kl-3',
        text: 'Keep inhaler medication accessible if you have a pre-existing respiratory condition.',
      },
      {
        id: 'vg-kl-4',
        text: 'Avoid haze-prone areas near industrial zones in Klang Valley.',
      },
    ],
    preventionTips: [
      {
        id: 'pt-kl-1',
        text: 'Download the myIPU Malaysia app to cross-reference local API readings.',
      },
    ],
    improvementActions: [
      {
        id: 'ia-kl-1',
        text: 'Support zero-open-burning policies during the El Niño dry season.',
      },
    ],
  },

  // ─── Ho Chi Minh City, Vietnam — AQI 171 (Unhealthy) ─────────────────────
  {
    id: 'ho-chi-minh-vn',
    name: 'Ho Chi Minh City',
    country: 'Vietnam',
    flagEmoji: '🇻🇳',
    pollution: {
      aqi: 171,
      category: 'Unhealthy',
      pm25: 68.9,
      pm10: 97.4,
      o3: 45.6,
      no2: 43.8,
      updatedAt: '2026-02-18T06:42:00+07:00',
    },
    visitorGuidelines: [
      {
        id: 'vg-hcm-1',
        text: 'Wear N95 mask at all times outdoors, especially during rush hour traffic.',
      },
      {
        id: 'vg-hcm-2',
        text: 'Avoid motorbike taxis on main boulevards; opt for enclosed Grab car rides instead.',
      },
      {
        id: 'vg-hcm-3',
        text: 'Book air-purifier equipped hotels or run a portable unit in your room.',
      },
      {
        id: 'vg-hcm-4',
        text: 'Increase water intake; pollution irritates mucous membranes and causes dehydration.',
      },
    ],
    preventionTips: [
      {
        id: 'pt-hcm-1',
        text: 'Schedule outdoor sightseeing before 7 AM when traffic emission peaks have not begun.',
      },
    ],
    improvementActions: [
      {
        id: 'ia-hcm-1',
        text: "Support the city's expansion of the HCMC metro system to reduce motorbike density.",
      },
    ],
  },

  // ─── Delhi, India — AQI 315 (Hazardous) ──────────────────────────────────
  {
    id: 'delhi-in',
    name: 'Delhi',
    country: 'India',
    flagEmoji: '🇮🇳',
    pollution: {
      aqi: 315,
      category: 'Hazardous',
      pm25: 212.4,
      pm10: 318.6,
      o3: 29.7,
      no2: 87.5,
      updatedAt: '2026-02-18T06:42:00+05:30',
    },
    visitorGuidelines: [
      {
        id: 'vg-dl-1',
        text: 'Do NOT go outdoors without an N95/P100 respirator — this is a health emergency level.',
      },
      {
        id: 'vg-dl-2',
        text: 'Seal windows and doors with tape; run air purifiers 24/7 at maximum speed.',
      },
      {
        id: 'vg-dl-3',
        text: 'Postpone non-critical travel to Delhi until AQI returns below 200.',
      },
      {
        id: 'vg-dl-4',
        text: 'Consult a doctor before travel if you have cardiac or pulmonary conditions.',
      },
      {
        id: 'vg-dl-5',
        text: 'Avoid any physical exertion outdoors; even short walks substantially increase pollutant intake.',
      },
    ],
    preventionTips: [
      {
        id: 'pt-dl-1',
        text: 'Monitor SAFAR India forecasts hourly and sign up for SMS alerts from CPCB.',
      },
      {
        id: 'pt-dl-2',
        text: 'Use only closed, air-conditioned vehicles with cabin air filters set to recirculation.',
      },
    ],
    improvementActions: [
      {
        id: 'ia-dl-1',
        text: 'Support the ban on diesel generators and crop-stubble burning in NCR states.',
      },
      {
        id: 'ia-dl-2',
        text: 'Advocate for accelerated adoption of electric buses under FAME II scheme.',
      },
    ],
  },

  // ─── Tokyo, Japan — AQI 28 (Good) ─────────────────────────────────────────
  {
    id: 'tokyo-jp',
    name: 'Tokyo',
    country: 'Japan',
    flagEmoji: '🇯🇵',
    pollution: {
      aqi: 28,
      category: 'Good',
      pm25: 5.1,
      pm10: 14.8,
      o3: 21.3,
      no2: 8.6,
      updatedAt: '2026-02-18T06:42:00+09:00',
    },
    visitorGuidelines: [],
    preventionTips: [
      {
        id: 'pt-tk-1',
        text: 'Air quality is excellent — enjoy outdoor activities freely.',
      },
      {
        id: 'pt-tk-2',
        text: 'During cherry blossom season, pollen (not AQI) may affect allergy sufferers; check pollen forecasts separately.',
      },
    ],
    improvementActions: [
      {
        id: 'ia-tk-1',
        text: "Continue supporting Tokyo's zero-emission vehicle mandate for new cars by 2035.",
      },
    ],
  },
]
