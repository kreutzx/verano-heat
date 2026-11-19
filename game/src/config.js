// Verano Heat — shared world configuration.
// Every module reads its numbers from here so the city layout, the traffic
// lanes and the minimap all agree with each other.

// City grid: GRID x GRID building blocks separated by two-way streets.
export const GRID = 7;              // blocks per side
export const PITCH = 60;            // centre-to-centre distance of streets
export const ROAD_W = 16;           // asphalt width
export const BLOCK = PITCH - ROAD_W; // 44 — the buildable square per block
export const HALF = (GRID * PITCH) / 2; // 210 — city runs -HALF..HALF
export const LANE = 4;              // lane offset from a street centre line

// The coast: sand starts south of the city, then open water.
export const BEACH_Z = HALF + 26;   // sand strip begins
export const WATER_Z = HALF + 62;   // waterline
export const MARINA_X = HALF + 74;  // marina basin centre, east of the city
export const WORLD_MIN = -HALF - 30;
export const WORLD_MAX_X = HALF + 150;
export const WORLD_MAX_Z = HALF + 190;

// Street centre lines, west to east / north to south.
export function streetLines() {
  const lines = [];
  for (let i = 0; i <= GRID; i++) lines.push(-HALF + i * PITCH);
  return lines;
}

// Warm Verano Bay palette.
export const COLORS = {
  sky: 0x8ec9e8,
  horizon: 0xf6d9a8,
  sun: 0xffe3b3,
  asphalt: 0x3c4148,
  sidewalk: 0xb9b0a0,
  sand: 0xe8d193,
  water: 0x1d6f8e,
  grass: 0x69a854,
  palmTrunk: 0x8a6844,
  palmLeaf: 0x2e8b4f,
};

// Car paint jobs used by traffic, parked cars and the player's steals.
export const CAR_COLORS = [
  0xd94f3d, 0x3d7bd9, 0xf2b134, 0x53b06a, 0xe8e4da, 0x8e6fc8,
  0x2f3542, 0xff7f50, 0x4fb3bf, 0xc0c6cc, 0x7a4a2b, 0xe56399,
];

// Invented Verano Bay businesses that sign the buildings.
export const BUSINESSES = [
  'CAFÉ BRISA', 'HOTEL PALMA', 'VERANO BANK', 'TACO OLA', 'NEON GYM',
  'MARINA MOTORS', 'SOL PHARMACY', 'BAHÍA BOOKS', 'CLUB FARO', 'PIZZA MAREA',
  'SURF & CO.', 'JOYERÍA LUNA', 'CINE VERANO', 'FLOR DEL SOL', 'BAR TIBURÓN',
  'PANADERÍA ORO', 'GALERÍA AZUL', 'HELADOS NUBE', 'TALLER RÁPIDO', 'MERCADO SUR',
];

// Where Marisol Vega, the fixer, waits for the player (marina café terrace).
export const MARISOL_POS = { x: MARINA_X - 58, z: WATER_Z - 26 };

// Player spawn, standing on the coast road a short walk from Marisol.
export const SPAWN_POS = { x: HALF - 60, z: HALF };

// The lighthouse hideout at the end of the east pier.
export const LIGHTHOUSE_POS = { x: MARINA_X + 66, z: WATER_Z + 58 };
