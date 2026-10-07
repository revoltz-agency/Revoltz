// Fictional records for interface testing only. These are not Google Places results
// and the reserved .example domains/URLs must never be contacted.
export const DEMO_LEADS = [
  {
    id: 'demo-001', placeId: 'demo-001', source: 'demo', demo: true,
    name: 'Pepper & Pine Bistro', category: 'Restaurant', city: 'Pune',
    address: 'Koregaon Park, Pune, Maharashtra', phone: '', website: '',
    rating: 4.8, reviews: 428, businessStatus: 'OPERATIONAL', mapsUrl: '',
    initialCRM: { status: 'NEW', assignedService: 'Website', estimatedDealValue: 85000 },
  },
  {
    id: 'demo-002', placeId: 'demo-002', source: 'demo', demo: true,
    name: 'Ivory Dental Studio', category: 'Dental clinic', city: 'Pune',
    address: 'Baner, Pune, Maharashtra', phone: '', website: 'https://ivory-dental.example',
    rating: 4.9, reviews: 312, businessStatus: 'OPERATIONAL', mapsUrl: '',
    demoAudit: { mobileViewportDetected: true, ctaDetected: false, contactFlowDetected: false, whatsappFlowDetected: false, structuredContactInfoDetected: true, titleDetected: true, socialLinks: [], weakWebsite: true, majorGapCount: 2, visualDesignAssessed: false, method: 'Illustrative demo signal' },
    initialCRM: { status: 'RESEARCHED', assignedService: 'AI Chatbot', estimatedDealValue: 120000 },
  },
  {
    id: 'demo-003', placeId: 'demo-003', source: 'demo', demo: true,
    name: 'Riverstone Fitness', category: 'Gym', city: 'Pune',
    address: 'Aundh, Pune, Maharashtra', phone: '', website: 'https://riverstone-fitness.example',
    rating: 4.6, reviews: 190, businessStatus: 'OPERATIONAL', mapsUrl: '',
    demoAudit: { mobileViewportDetected: false, ctaDetected: true, contactFlowDetected: true, whatsappFlowDetected: false, structuredContactInfoDetected: true, titleDetected: true, socialLinks: [], weakWebsite: false, majorGapCount: 1, visualDesignAssessed: false, method: 'Illustrative demo signal' },
    initialCRM: { status: 'CONTACTED', lastContacted: '2026-10-01', nextFollowUp: '2026-10-04', assignedService: 'Lead Generation', estimatedDealValue: 95000 },
  },
  {
    id: 'demo-004', placeId: 'demo-004', source: 'demo', demo: true,
    name: 'Solstice Salon', category: 'Salon', city: 'Pune',
    address: 'Viman Nagar, Pune, Maharashtra', phone: '', website: '',
    rating: 4.5, reviews: 156, businessStatus: 'OPERATIONAL', mapsUrl: '',
    initialCRM: { status: 'REPLIED', assignedService: 'Social Media', estimatedDealValue: 60000 },
  },
  {
    id: 'demo-005', placeId: 'demo-005', source: 'demo', demo: true,
    name: 'Metric & Moss CA', category: 'CA firm', city: 'Pune',
    address: 'Deccan, Pune, Maharashtra', phone: '', website: 'https://metric-moss.example',
    rating: 4.7, reviews: 88, businessStatus: 'OPERATIONAL', mapsUrl: '',
    demoAudit: { mobileViewportDetected: true, ctaDetected: false, contactFlowDetected: false, whatsappFlowDetected: false, structuredContactInfoDetected: false, titleDetected: true, socialLinks: [], weakWebsite: true, majorGapCount: 2, visualDesignAssessed: false, method: 'Illustrative demo signal' },
    initialCRM: { status: 'INTERESTED', assignedService: 'Finance Automation', estimatedDealValue: 145000 },
  },
  {
    id: 'demo-006', placeId: 'demo-006', source: 'demo', demo: true,
    name: 'Aster Lane Realty', category: 'Real estate agency', city: 'Pune',
    address: 'Kalyani Nagar, Pune, Maharashtra', phone: '', website: 'https://aster-lane.example',
    rating: 4.4, reviews: 74, businessStatus: 'OPERATIONAL', mapsUrl: '',
    demoAudit: { mobileViewportDetected: true, ctaDetected: true, contactFlowDetected: true, whatsappFlowDetected: false, structuredContactInfoDetected: true, titleDetected: true, socialLinks: [], weakWebsite: false, majorGapCount: 0, visualDesignAssessed: false, method: 'Illustrative demo signal' },
    initialCRM: { status: 'CALL BOOKED', assignedService: 'AI Automation', estimatedDealValue: 180000 },
  },
  {
    id: 'demo-007', placeId: 'demo-007', source: 'demo', demo: true,
    name: 'Wok & Whisk Kitchen', category: 'Cloud kitchen', city: 'Pune',
    address: 'Kharadi, Pune, Maharashtra', phone: '', website: '',
    rating: 4.3, reviews: 98, businessStatus: 'OPERATIONAL', mapsUrl: '',
    initialCRM: { status: 'PROPOSAL', assignedService: 'AI Chatbot', estimatedDealValue: 110000 },
  },
  {
    id: 'demo-008', placeId: 'demo-008', source: 'demo', demo: true,
    name: 'Grove & Grain Kitchen', category: 'Restaurant', city: 'Pune',
    address: 'Kothrud, Pune, Maharashtra', phone: '', website: 'https://grove-grain.example',
    rating: 4.7, reviews: 640, businessStatus: 'OPERATIONAL', mapsUrl: '',
    demoAudit: { mobileViewportDetected: false, ctaDetected: false, contactFlowDetected: false, whatsappFlowDetected: false, structuredContactInfoDetected: false, titleDetected: true, socialLinks: ['demo:instagram'], weakWebsite: true, majorGapCount: 3, visualDesignAssessed: false, method: 'Illustrative demo signal' },
    initialCRM: { status: 'WON', assignedService: 'Website', estimatedDealValue: 210000 },
  },
  {
    id: 'demo-009', placeId: 'demo-009', source: 'demo', demo: true,
    name: 'Bloomline Skin & Beauty', category: 'Salon', city: 'Pune',
    address: 'Wakad, Pune, Maharashtra', phone: '', website: '',
    rating: 4.2, reviews: 42, businessStatus: 'OPERATIONAL', mapsUrl: '',
    initialCRM: { status: 'LOST', assignedService: 'Social Media', estimatedDealValue: 50000 },
  },
  {
    id: 'demo-010', placeId: 'demo-010', source: 'demo', demo: true,
    name: 'The Courtyard Dental', category: 'Dental clinic', city: 'Pune',
    address: 'Pimple Saudagar, Pune, Maharashtra', phone: '', website: 'https://courtyard-dental.example',
    rating: 4.9, reviews: 440, businessStatus: 'OPERATIONAL', mapsUrl: '',
    demoAudit: { mobileViewportDetected: true, ctaDetected: true, contactFlowDetected: true, whatsappFlowDetected: false, structuredContactInfoDetected: true, titleDetected: true, socialLinks: ['demo:instagram'], weakWebsite: false, majorGapCount: 0, visualDesignAssessed: false, method: 'Illustrative demo signal' },
    initialCRM: { status: 'DO NOT CONTACT', assignedService: 'Website', estimatedDealValue: 90000 },
  },
];

export const LEAD_STATUSES = [
  'NEW', 'RESEARCHED', 'CONTACTED', 'REPLIED', 'INTERESTED', 'CALL BOOKED', 'PROPOSAL', 'WON', 'LOST', 'DO NOT CONTACT',
];

export const SERVICES = [
  'Website', 'Website redesign', 'Lead capture', 'AI Automation', 'AI Chatbot', 'Lead Generation', 'Social Media', 'Finance Automation',
];

export const CONTACT_PREFERENCES = [
  { value: 'not-checked', label: 'Not checked' },
  { value: 'email-permitted', label: 'Email contact permitted' },
  { value: 'whatsapp-opt-in', label: 'WhatsApp opt-in confirmed' },
  { value: 'do-not-contact', label: 'Do not contact' },
];
