export interface PresetLocation {
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
}

export const WICHITA_LOCATIONS: PresetLocation[] = [
  // Healthcare
  { name: "Wesley Medical Center", address: "550 N Hillside St, Wichita, KS 67214", category: "Healthcare", lat: 37.6956, lng: -97.3098 },
  { name: "Ascension Via Christi St. Francis", address: "929 N St Francis St, Wichita, KS 67214", category: "Healthcare", lat: 37.6972, lng: -97.3266 },
  { name: "Ascension Via Christi St. Joseph", address: "3600 E Harry St, Wichita, KS 67218", category: "Healthcare", lat: 37.6636, lng: -97.2867 },
  { name: "Robert J. Dole VA Medical Center", address: "5500 E Kellogg Dr, Wichita, KS 67218", category: "Healthcare", lat: 37.6670, lng: -97.2488 },

  // Education
  { name: "Wichita State University", address: "1845 Fairmount St, Wichita, KS 67260", category: "Education", lat: 37.7189, lng: -97.2938 },
  { name: "Friends University", address: "2100 W University Ave, Wichita, KS 67213", category: "Education", lat: 37.6828, lng: -97.3616 },
  { name: "Newman University", address: "3100 McCormick Ave, Wichita, KS 67213", category: "Education", lat: 37.6728, lng: -97.3621 },
  { name: "WSU Tech - NCAT / NIAR", address: "4004 N Webb Rd, Wichita, KS 67226", category: "Education", lat: 37.7352, lng: -97.2350 },
  { name: "WSU Tech - South Campus", address: "3821 E Harry St, Wichita, KS 67218", category: "Education", lat: 37.6640, lng: -97.2890 },
  { name: "WSU Tech - City Center", address: "301 S Grove St, Wichita, KS 67211", category: "Education", lat: 37.6810, lng: -97.3380 },
  { name: "WSU Tech - Old Town", address: "213 N Mead St, Wichita, KS 67202", category: "Education", lat: 37.6885, lng: -97.3260 },
  { name: "WSU Tech - NICHE", address: "124 S Broadway St, Wichita, KS 67202", category: "Education", lat: 37.6860, lng: -97.3340 },
  { name: "Butler Community College (Andover)", address: "715 E 13th St, Andover, KS 67002", category: "Education", lat: 37.7136, lng: -97.1364 },

  // Shopping
  { name: "Towne East Square", address: "7700 E Kellogg Dr, Wichita, KS 67207", category: "Shopping", lat: 37.6678, lng: -97.2164 },
{ name: "Bradley Fair", address: "2000 N Rock Rd, Wichita, KS 67206", category: "Shopping", lat: 37.7089, lng: -97.2478 },
  { name: "New Market Square", address: "2441 N Maize Rd, Wichita, KS 67205", category: "Shopping", lat: 37.7153, lng: -97.4186 },

  // Transportation
  { name: "Wichita Dwight D. Eisenhower Airport", address: "2277 Eisenhower Airport Pkwy, Wichita, KS 67209", category: "Transportation", lat: 37.6499, lng: -97.4331 },
  { name: "Wichita Transit Downtown Station", address: "214 S Topeka St, Wichita, KS 67202", category: "Transportation", lat: 37.6847, lng: -97.3372 },

  // Government & Services
  { name: "Wichita City Hall", address: "455 N Main St, Wichita, KS 67202", category: "Government", lat: 37.6905, lng: -97.3364 },
  { name: "Sedgwick County Courthouse", address: "525 N Main St, Wichita, KS 67203", category: "Government", lat: 37.6917, lng: -97.3364 },
  { name: "Kansas DMV (Wichita)", address: "1007 S Main St, Wichita, KS 67213", category: "Government", lat: 37.6774, lng: -97.3369 },

  // Grocery
  { name: "Dillons (E 21st)", address: "3030 E 21st St N, Wichita, KS 67214", category: "Grocery", lat: 37.7058, lng: -97.2959 },
  { name: "Walmart Supercenter (E Kellogg)", address: "3030 N Rock Rd, Wichita, KS 67226", category: "Grocery", lat: 37.7159, lng: -97.2478 },
  { name: "Walmart Supercenter (W Kellogg)", address: "3116 W Kellogg Dr, Wichita, KS 67213", category: "Grocery", lat: 37.6659, lng: -97.3766 },

  // Community
  { name: "Downtown Wichita", address: "Douglas Ave & Main St, Wichita, KS 67202", category: "Community", lat: 37.6872, lng: -97.3364 },
  { name: "Old Town", address: "E 1st St N, Wichita, KS 67202", category: "Community", lat: 37.6880, lng: -97.3256 },
  { name: "Exploration Place", address: "300 N McLean Blvd, Wichita, KS 67203", category: "Community", lat: 37.6937, lng: -97.3506 },
  { name: "Wichita Public Library (Main)", address: "223 S Main St, Wichita, KS 67202", category: "Community", lat: 37.6844, lng: -97.3364 },
  { name: "Empower North End", address: "2601 N Arkansas Ave, Wichita, KS 67204", category: "Community", lat: 37.7140, lng: -97.3400 },
  { name: "Build & Rebuild", address: "1751 N Ash St, Wichita, KS 67214", category: "Community", lat: 37.7050, lng: -97.3240 },

  // Faith
  { name: "The Bridge Church", address: "2328 E 13th St N, Wichita, KS 67214", category: "Faith", lat: 37.7030, lng: -97.3100 },
  { name: "Iasis Christian Center", address: "1914 E 11th St N, Wichita, KS 67214", category: "Faith", lat: 37.7010, lng: -97.3150 },
  { name: "Dellrose United Methodist Church", address: "1502 N Dellrose St, Wichita, KS 67208", category: "Faith", lat: 37.7020, lng: -97.2830 },

  // Employment
  { name: "Spirit AeroSystems", address: "3801 S Oliver St, Wichita, KS 67210", category: "Employment", lat: 37.6580, lng: -97.2810 },
  { name: "Textron Aviation", address: "7123 Southwest Blvd, Wichita, KS 67215", category: "Employment", lat: 37.6380, lng: -97.3960 },

  // Recreation & Fitness
  { name: "INTRUST Bank Arena", address: "500 E Waterman St, Wichita, KS 67202", category: "Recreation", lat: 37.6842, lng: -97.3302 },
  { name: "Riverfront Stadium", address: "300 S Sycamore St, Wichita, KS 67213", category: "Recreation", lat: 37.6808, lng: -97.3478 },
  { name: "Botanica Wichita", address: "701 Amidon St, Wichita, KS 67203", category: "Recreation", lat: 37.6925, lng: -97.3572 },
  { name: "YMCA - Downtown", address: "402 N Market St, Wichita, KS 67202", category: "Recreation", lat: 37.6900, lng: -97.3340 },
  { name: "YMCA - East", address: "9333 E Douglas Ave, Wichita, KS 67207", category: "Recreation", lat: 37.6870, lng: -97.2060 },
  { name: "YMCA - North", address: "3330 N Woodlawn Blvd, Wichita, KS 67220", category: "Recreation", lat: 37.7280, lng: -97.2750 },
  { name: "YMCA - Northwest", address: "13838 W 21st St N, Wichita, KS 67235", category: "Recreation", lat: 37.7070, lng: -97.4700 },
  { name: "YMCA - West", address: "6940 Newell St, Wichita, KS 67212", category: "Recreation", lat: 37.6930, lng: -97.4090 },
  { name: "YMCA - South (Devore)", address: "3405 S Meridian Ave, Wichita, KS 67217", category: "Recreation", lat: 37.6540, lng: -97.3580 },
  { name: "YMCA - WSU / Steve Clark", address: "2060 N Mid-Campus Dr, Wichita, KS 67208", category: "Recreation", lat: 37.7180, lng: -97.2950 },
  { name: "Naftzger Park", address: "601 E Douglas Ave, Wichita, KS 67202", category: "Recreation", lat: 37.6870, lng: -97.3280 },
];

// Wichita zip code to neighborhood mapping
export const WICHITA_ZIP_NEIGHBORHOODS: Record<string, string> = {
  "67202": "Downtown / Old Town",
  "67203": "West Wichita / Delano",
  "67204": "North End / Park City",
  "67205": "Northwest Wichita / Maize",
  "67206": "East Wichita / College Hill",
  "67207": "Southeast Wichita",
  "67208": "Eastborough / College Hill",
  "67209": "West Wichita / Airport",
  "67210": "South Central / Beechwood",
  "67211": "South Wichita / Planeview",
  "67212": "West Wichita / Orchard Breeze",
  "67213": "Southwest Wichita / Midtown",
  "67214": "Northeast Wichita / WSU Area",
  "67215": "Haysville / South Wichita",
  "67216": "South Wichita / McAdams",
  "67217": "South Wichita / Oaklawn",
  "67218": "Southeast Wichita / Lincoln Heights",
  "67219": "North Wichita / Bel Aire",
  "67220": "Northeast Wichita / Woodlawn",
  "67226": "Northeast Wichita / Webb Rd Corridor",
  "67230": "East Wichita / Greenwich",
  "67235": "Northwest Wichita / Goddard",
  "67260": "WSU Campus",
  "67002": "Andover",
};

// Extract zip code from an address string
export function extractZip(address: string): string | null {
  const match = address.match(/\b(67\d{3})\b/);
  return match ? match[1] : null;
}

export const LOCATION_CATEGORIES = [
  "Healthcare",
  "Education",
  "Employment",
  "Shopping",
  "Transportation",
  "Government",
  "Grocery",
  "Community",
  "Faith",
  "Recreation",
];
