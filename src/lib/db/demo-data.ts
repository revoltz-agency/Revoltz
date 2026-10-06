/**
 * Demo Mode dataset.
 *
 * ~12 FICTIONAL businesses (invented names, invented contact details, reserved
 * `.example` domains per RFC 2606 and non-routable phone numbers). Nothing here
 * is real Places data and no Google API call is made in Demo Mode.
 *
 * Each record also carries a `site` profile describing what a *simulated*
 * website audit would find, so the full UI (analysis panel, scoring factors,
 * pitch generation) can be exercised without touching the network.
 */

import type { ServiceKey } from '../types';

export interface DemoSiteProfile {
  /** Simulated HTTP result. `null` = no website at all. */
  status: number;
  finalUrl: string;
  bytes: number;
  durationMs: number;
  contentType: string;
  lastModified: string | null;
  https: boolean;
  title: string;
  metaDescription: string | null;
  h1Count: number;
  viewport: boolean;
  formCount: number;
  telLinks: number;
  mailtoLinks: string[];
  whatsappLinks: number;
  ctaCount: number;
  social: { platform: string; url: string }[];
  outdatedHints: string[];
  generator: string | null;
  copyrightYear: number | null;
  addressOnPage: boolean;
  hoursOnPage: boolean;
  phoneOnPage: boolean;
}

export interface DemoBusiness {
  id: string;
  name: string;
  primaryType: string;
  types: string[];
  industryKeywords: string[];
  address: string;
  phone: string;
  website: string | null;
  rating: number | null;
  reviews: number | null;
  businessStatus: string;
  openNow: boolean | null;
  priceLevel: string | null;
  email?: string | null;
  suggestedService: ServiceKey;
  tags?: string[];
  site?: DemoSiteProfile | null;
}

const PUNE = 'Pune, Maharashtra';

export const DEMO_BUSINESSES: DemoBusiness[] = [
  {
    id: 'demo_01',
    name: 'Spice Garden Family Restaurant',
    primaryType: 'restaurant',
    types: ['restaurant', 'food', 'point_of_interest'],
    industryKeywords: ['restaurant', 'restaurants', 'food', 'dining', 'family restaurant'],
    address: `Shop 4, Sunrise Plaza, Fergusson College Road, Shivajinagar, ${PUNE} 411005`,
    phone: '+91 90000 00011',
    website: null,
    rating: 4.3,
    reviews: 412,
    businessStatus: 'OPERATIONAL',
    openNow: true,
    priceLevel: 'PRICE_LEVEL_MODERATE',
    suggestedService: 'WEBSITE',
    tags: ['high-footfall'],
    site: null,
  },
  {
    id: 'demo_02',
    name: 'Dr. Mehta Dental Care Clinic',
    primaryType: 'dentist',
    types: ['dentist', 'health', 'point_of_interest'],
    industryKeywords: ['dental', 'dentist', 'dental clinic', 'clinic', 'dentistry'],
    address: `2nd Floor, Wellness House, Baner Road, Baner, ${PUNE} 411045`,
    phone: '+91 90000 00022',
    website: 'https://drmehtadental.example',
    rating: 4.7,
    reviews: 189,
    businessStatus: 'OPERATIONAL',
    openNow: true,
    priceLevel: null,
    email: 'frontdesk@drmehtadental.example',
    suggestedService: 'AI_CHATBOT',
    site: {
      status: 200,
      finalUrl: 'http://drmehtadental.example/',
      bytes: 184_320,
      durationMs: 940,
      contentType: 'text/html; charset=UTF-8',
      lastModified: '2021-06-14T10:22:00Z',
      https: false,
      title: 'Dr Mehta Dental Care',
      metaDescription: null,
      h1Count: 0,
      viewport: false,
      formCount: 0,
      telLinks: 0,
      mailtoLinks: ['frontdesk@drmehtadental.example'],
      whatsappLinks: 0,
      ctaCount: 0,
      social: [{ platform: 'facebook', url: 'https://facebook.com/drmehtadental' }],
      outdatedHints: ['wixstatic assets', 'no viewport meta', 'jquery 1.11'],
      generator: 'Wix.com Website Builder',
      copyrightYear: 2019,
      addressOnPage: true,
      hoursOnPage: false,
      phoneOnPage: true,
    },
  },
  {
    id: 'demo_03',
    name: 'Kulkarni & Associates (Chartered Accountants)',
    primaryType: 'accounting',
    types: ['accounting', 'finance', 'point_of_interest'],
    industryKeywords: ['ca', 'ca firm', 'chartered accountant', 'accounting', 'accountant', 'tax'],
    address: `Office 301, Trade Centre, Aundh Road, Aundh, ${PUNE} 411007`,
    phone: '+91 90000 00033',
    website: 'https://kulkarnica.example',
    rating: 4.5,
    reviews: 96,
    businessStatus: 'OPERATIONAL',
    openNow: false,
    priceLevel: null,
    suggestedService: 'FINANCE_AUTOMATION',
    site: {
      status: 200,
      finalUrl: 'https://kulkarnica.example/',
      bytes: 96_500,
      durationMs: 520,
      contentType: 'text/html; charset=utf-8',
      lastModified: '2024-11-02T08:00:00Z',
      https: true,
      title: 'Kulkarni & Associates | Chartered Accountants in Pune',
      metaDescription: 'Chartered accountants in Aundh, Pune offering GST, income tax and audit services.',
      h1Count: 1,
      viewport: true,
      formCount: 0,
      telLinks: 1,
      mailtoLinks: [],
      whatsappLinks: 0,
      ctaCount: 0,
      social: [{ platform: 'linkedin', url: 'https://linkedin.com/company/kulkarnica' }],
      outdatedHints: [],
      generator: null,
      copyrightYear: 2025,
      addressOnPage: true,
      hoursOnPage: true,
      phoneOnPage: true,
    },
  },
  {
    id: 'demo_04',
    name: 'IronCore Fitness Studio',
    primaryType: 'gym',
    types: ['gym', 'health', 'point_of_interest'],
    industryKeywords: ['gym', 'gyms', 'fitness', 'crossfit', 'fitness centre', 'fitness center'],
    address: `Ground Floor, Steel Building, Kalyani Nagar, ${PUNE} 411006`,
    phone: '+91 90000 00044',
    website: null,
    rating: 4.2,
    reviews: 320,
    businessStatus: 'OPERATIONAL',
    openNow: true,
    priceLevel: 'PRICE_LEVEL_MODERATE',
    suggestedService: 'LEAD_GENERATION',
    tags: ['instagram-active'],
    site: null,
  },
  {
    id: 'demo_05',
    name: 'Glamour Studio Unisex Salon',
    primaryType: 'beauty_salon',
    types: ['beauty_salon', 'hair_care', 'point_of_interest'],
    industryKeywords: ['salon', 'salons', 'beauty', 'hair', 'spa', 'unisex salon'],
    address: `Shop 12, Marigold Complex, Kothrud, ${PUNE} 411038`,
    phone: '+91 90000 00055',
    website: 'http://glamourstudiosalon.example',
    rating: 4.0,
    reviews: 78,
    businessStatus: 'OPERATIONAL',
    openNow: null,
    priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
    suggestedService: 'SOCIAL_MEDIA',
    site: {
      status: 200,
      finalUrl: 'http://glamourstudiosalon.example/',
      bytes: 340_000,
      durationMs: 2400,
      contentType: 'text/html',
      lastModified: '2019-02-11T00:00:00Z',
      https: false,
      title: 'Glamour Studio',
      metaDescription: null,
      h1Count: 3,
      viewport: false,
      formCount: 0,
      telLinks: 0,
      mailtoLinks: [],
      whatsappLinks: 0,
      ctaCount: 1,
      social: [{ platform: 'instagram', url: 'https://instagram.com/glamourstudio.example' }],
      outdatedHints: ['bootstrap 3', 'inline font tags', 'last modified 2019'],
      generator: 'Bootstrap 3 template',
      copyrightYear: 2018,
      addressOnPage: false,
      hoursOnPage: false,
      phoneOnPage: true,
    },
  },
  {
    id: 'demo_06',
    name: 'PuneNest Realty Advisors',
    primaryType: 'real_estate_agency',
    types: ['real_estate_agency', 'point_of_interest'],
    industryKeywords: ['real estate', 'realty', 'property', 'realtor', 'real estate agency'],
    address: `Tower B, Business Bay, Wakad, ${PUNE} 411057`,
    phone: '+91 90000 00066',
    website: 'https://punenestrealty.example',
    rating: 4.6,
    reviews: 210,
    businessStatus: 'OPERATIONAL',
    openNow: true,
    priceLevel: null,
    email: 'hello@punenestrealty.example',
    suggestedService: 'AI_CHATBOT',
    site: {
      status: 200,
      finalUrl: 'https://punenestrealty.example/',
      bytes: 220_000,
      durationMs: 610,
      contentType: 'text/html; charset=utf-8',
      lastModified: '2025-09-18T09:00:00Z',
      https: true,
      title: 'PuneNest Realty Advisors | Flats & Offices in Pune',
      metaDescription: 'Buy, sell or rent residential and commercial property in Wakad, Hinjewadi and Baner.',
      h1Count: 1,
      viewport: true,
      formCount: 2,
      telLinks: 2,
      mailtoLinks: ['hello@punenestrealty.example'],
      whatsappLinks: 1,
      ctaCount: 6,
      social: [
        { platform: 'instagram', url: 'https://instagram.com/punenestrealty' },
        { platform: 'linkedin', url: 'https://linkedin.com/company/punenestrealty' },
        { platform: 'youtube', url: 'https://youtube.com/@punenestrealty' },
      ],
      outdatedHints: [],
      generator: 'Next.js',
      copyrightYear: 2026,
      addressOnPage: true,
      hoursOnPage: true,
      phoneOnPage: true,
    },
  },
  {
    id: 'demo_07',
    name: 'CloudBite Kitchen',
    primaryType: 'meal_delivery',
    types: ['meal_delivery', 'restaurant', 'food', 'point_of_interest'],
    industryKeywords: ['cloud kitchen', 'cloud kitchens', 'meal delivery', 'food delivery', 'kitchen'],
    address: `Unit 7, Food Park Lane, Hadapsar, ${PUNE} 411028`,
    phone: '+91 90000 00077',
    website: null,
    rating: 4.4,
    reviews: 540,
    businessStatus: 'OPERATIONAL',
    openNow: true,
    priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
    suggestedService: 'AI_AUTOMATION',
    tags: ['aggregator-dependent'],
    site: null,
  },
  {
    id: 'demo_08',
    name: 'Sharma Hardware & Sanitaryware',
    primaryType: 'hardware_store',
    types: ['hardware_store', 'store', 'point_of_interest'],
    industryKeywords: ['hardware', 'sanitaryware', 'building material', 'store'],
    address: `Gala 3, Market Yard Road, Gultekdi, ${PUNE} 411037`,
    phone: '+91 90000 00088',
    website: null,
    rating: 3.9,
    reviews: 45,
    businessStatus: 'OPERATIONAL',
    openNow: null,
    priceLevel: null,
    suggestedService: 'WEBSITE',
    site: null,
  },
  {
    id: 'demo_09',
    name: 'Little Steps Preschool & Daycare',
    primaryType: 'school',
    types: ['school', 'point_of_interest'],
    industryKeywords: ['preschool', 'pre school', 'daycare', 'school', 'playschool'],
    address: `Bungalow 9, Rose Avenue, Viman Nagar, ${PUNE} 411014`,
    phone: '+91 90000 00099',
    website: 'https://littlestepspreschool.example',
    rating: 4.8,
    reviews: 62,
    businessStatus: 'OPERATIONAL',
    openNow: false,
    priceLevel: null,
    suggestedService: 'WEBSITE',
    site: {
      status: 200,
      finalUrl: 'https://littlestepspreschool.example/',
      bytes: 140_000,
      durationMs: 700,
      contentType: 'text/html; charset=utf-8',
      lastModified: '2023-04-01T00:00:00Z',
      https: true,
      title: 'Little Steps Preschool',
      metaDescription: 'Preschool and daycare in Viman Nagar.',
      h1Count: 1,
      viewport: true,
      formCount: 0,
      telLinks: 0,
      mailtoLinks: [],
      whatsappLinks: 0,
      ctaCount: 0,
      social: [{ platform: 'facebook', url: 'https://facebook.com/littlestepspreschool' }],
      outdatedHints: ['single-page brochure site', 'no enquiry form'],
      generator: 'GoDaddy Website Builder',
      copyrightYear: 2023,
      addressOnPage: true,
      hoursOnPage: false,
      phoneOnPage: false,
    },
  },
  {
    id: 'demo_10',
    name: 'Velocity Auto Garage',
    primaryType: 'car_repair',
    types: ['car_repair', 'point_of_interest'],
    industryKeywords: ['garage', 'car repair', 'auto', 'car service', 'workshop'],
    address: `Plot 22, Industrial Estate, Bhosari, ${PUNE} 411026`,
    phone: '+91 90000 00100',
    website: null,
    rating: 4.1,
    reviews: 150,
    businessStatus: 'OPERATIONAL',
    openNow: true,
    priceLevel: null,
    suggestedService: 'AI_AUTOMATION',
    site: null,
  },
  {
    id: 'demo_11',
    name: 'Rangoli Boutique & Studio',
    primaryType: 'clothing_store',
    types: ['clothing_store', 'store', 'point_of_interest'],
    industryKeywords: ['boutique', 'clothing', 'fashion', 'apparel', 'designer'],
    address: `Shop 8, Heritage Lane, Camp, ${PUNE} 411001`,
    phone: '+91 90000 00111',
    website: null,
    rating: 4.5,
    reviews: 88,
    businessStatus: 'OPERATIONAL',
    openNow: null,
    priceLevel: 'PRICE_LEVEL_MODERATE',
    suggestedService: 'SOCIAL_MEDIA',
    tags: ['instagram-only'],
    site: null,
  },
  {
    id: 'demo_12',
    name: 'Zenith Physiotherapy & Rehab Centre',
    primaryType: 'physiotherapist',
    types: ['physiotherapist', 'health', 'point_of_interest'],
    industryKeywords: ['physiotherapy', 'physiotherapist', 'rehab', 'clinic', 'therapy'],
    address: `First Floor, Health Square, Erandwane, ${PUNE} 411004`,
    phone: '+91 90000 00122',
    website: 'https://zenithphysio.example',
    rating: 4.9,
    reviews: 275,
    businessStatus: 'OPERATIONAL',
    openNow: true,
    priceLevel: null,
    email: 'care@zenithphysio.example',
    suggestedService: 'AI_CHATBOT',
    site: {
      status: 200,
      finalUrl: 'https://zenithphysio.example/',
      bytes: 160_000,
      durationMs: 480,
      contentType: 'text/html; charset=utf-8',
      lastModified: '2025-07-22T00:00:00Z',
      https: true,
      title: 'Zenith Physiotherapy & Rehab | Erandwane, Pune',
      metaDescription: 'Sports injury rehab and physiotherapy sessions in Erandwane, Pune. Book an assessment online.',
      h1Count: 1,
      viewport: true,
      formCount: 1,
      telLinks: 1,
      mailtoLinks: ['care@zenithphysio.example'],
      whatsappLinks: 1,
      ctaCount: 4,
      social: [{ platform: 'instagram', url: 'https://instagram.com/zenithphysio' }],
      outdatedHints: [],
      generator: 'WordPress',
      copyrightYear: 2026,
      addressOnPage: true,
      hoursOnPage: true,
      phoneOnPage: true,
    },
  },
];

/** Extra demo records used to make demo cities/campaigns feel populated. */
export const DEMO_CITY = 'Pune';

export const DEMO_INDUSTRY_SUGGESTIONS: string[] = [
  'Restaurants',
  'Dental clinics',
  'CA firms',
  'Gyms',
  'Salons',
  'Real estate agencies',
  'Cloud kitchens',
  'Physiotherapy centres',
  'Preschools',
  'Boutiques',
];
