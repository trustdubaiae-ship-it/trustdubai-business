// Canonical company-category list — the SINGLE source of truth across the whole
// platform (business app, admin, public site). Keep this identical in all three
// repos so company.category, registration, the admin editor and the Marketplace
// all use the same values (otherwise category matching breaks).
export const CATEGORIES = [
  // Construction / fit-out trades
  'Interior Design', 'Fit-Out', 'Renovation', 'Construction & Civil',
  'Joinery & Carpentry', 'MEP', 'Electrical', 'Plumbing', 'HVAC & AC',
  'Painting', 'Flooring & Tiling', 'False Ceiling & Gypsum', 'Waterproofing',
  'Glass & Aluminium', 'Metal & Steel Works', 'Kitchen & Bathroom',
  'Landscaping', 'Swimming Pools', 'Signage & Branding', 'Furniture & Decor',
  'Smart Home & Automation', 'Demolition',
  // General services
  'Cleaning Services', 'Handyman & Maintenance', 'Movers & Storage',
  'Pest Control', 'Security & CCTV',
  // Other business types
  'Restaurant & Cafe', 'Gym & Fitness', 'Salon & Spa', 'Medical & Clinic',
  'Legal Services', 'Real Estate', 'IT & Technology', 'Automotive',
  'Education', 'Retail', 'Other',
]

export default CATEGORIES
