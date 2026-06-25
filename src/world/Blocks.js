// ─── Rasmiy Mojang blok ID lari (Java Edition 1.20+) ───
export const BLOCK_AIR          = 0;
export const BLOCK_STONE        = 1;
export const BLOCK_GRASS        = 2;
export const BLOCK_DIRT         = 3;
export const BLOCK_COBBLESTONE  = 4;
export const BLOCK_OAK_PLANKS   = 5;
export const BLOCK_OAK_SAPLING  = 6;
export const BLOCK_BEDROCK      = 7;
export const BLOCK_WATER        = 8;
export const BLOCK_LAVA         = 9;
export const BLOCK_SAND         = 12;
export const BLOCK_GRAVEL       = 13;
export const BLOCK_COAL_ORE     = 16;
export const BLOCK_OAK_LOG      = 17;
export const BLOCK_OAK_LEAVES   = 18;
export const BLOCK_GLASS        = 20;
export const BLOCK_IRON_ORE     = 15;
export const BLOCK_GOLD_ORE     = 14;
export const BLOCK_DIAMOND_ORE  = 56;
export const BLOCK_SNOW         = 78;
export const BLOCK_SNOW_BLOCK   = 80;

// ─── Qo‘shimcha alias (eski kodlar bilan moslik uchun) ───
export const BLOCK_LEAVES = BLOCK_OAK_LEAVES; // 18
export const BLOCK_WOOD   = BLOCK_OAK_LOG;    // 17 (agar kerak bo‘lsa)
export const BLOCK_PLANKS = BLOCK_OAK_PLANKS; // 5 (agar kerak bo‘lsa)

export const Blocks = {
  [BLOCK_AIR]:          { name: 'Air',          solid: false, transparent: true,  hardness: 0,   color: { top: null, side: null, bottom: null } },
  [BLOCK_STONE]:        { name: 'Stone',        solid: true,  transparent: false, hardness: 1.5, color: { top: '#8c8c8c', side: '#8c8c8c', bottom: '#8c8c8c' } },
  [BLOCK_GRASS]:        { name: 'Grass Block',  solid: true,  transparent: false, hardness: 0.6, color: { top: '#5a9e3a', side: '#8B6343', bottom: '#8B6343' } },
  [BLOCK_DIRT]:         { name: 'Dirt',         solid: true,  transparent: false, hardness: 0.5, color: { top: '#8B6343', side: '#8B6343', bottom: '#8B6343' } },
  [BLOCK_COBBLESTONE]:  { name: 'Cobblestone',  solid: true,  transparent: false, hardness: 2.0, color: { top: '#7a7a7a', side: '#7a7a7a', bottom: '#7a7a7a' } },
  [BLOCK_OAK_PLANKS]:   { name: 'Oak Planks',   solid: true,  transparent: false, hardness: 2.0, color: { top: '#c8a96a', side: '#c8a96a', bottom: '#c8a96a' } },
  [BLOCK_OAK_LOG]:      { name: 'Oak Log',      solid: true,  transparent: false, hardness: 2.0, color: { top: '#c8a96a', side: '#7a5c2e', bottom: '#c8a96a' } },
  [BLOCK_OAK_LEAVES]:   { name: 'Oak Leaves',   solid: true,  transparent: true,  hardness: 0.2, color: { top: '#3a8a28', side: '#3a8a28', bottom: '#3a8a28' } },
  [BLOCK_SAND]:         { name: 'Sand',         solid: true,  transparent: false, hardness: 0.5, color: { top: '#ddd095', side: '#ddd095', bottom: '#ddd095' } },
  [BLOCK_WATER]:        { name: 'Water',        solid: false, transparent: true,  hardness: 100, color: { top: '#2980b9', side: '#2980b9', bottom: '#2980b9' }, alpha: 0.7 },
  [BLOCK_LAVA]:         { name: 'Lava',         solid: false, transparent: false, hardness: 100, color: { top: '#e74c3c', side: '#c0392b', bottom: '#c0392b' } },
  [BLOCK_COAL_ORE]:     { name: 'Coal Ore',     solid: true,  transparent: false, hardness: 3.0, color: { top: '#555555', side: '#555555', bottom: '#555555' } },
  [BLOCK_IRON_ORE]:     { name: 'Iron Ore',     solid: true,  transparent: false, hardness: 3.0, color: { top: '#a97c50', side: '#a97c50', bottom: '#a97c50' } },
  [BLOCK_GOLD_ORE]:     { name: 'Gold Ore',     solid: true,  transparent: false, hardness: 3.0, color: { top: '#d4ac0d', side: '#d4ac0d', bottom: '#d4ac0d' } },
  [BLOCK_DIAMOND_ORE]:  { name: 'Diamond Ore',  solid: true,  transparent: false, hardness: 5.0, color: { top: '#5dade2', side: '#5dade2', bottom: '#5dade2' } },
  [BLOCK_SNOW]:         { name: 'Snow',         solid: false, transparent: false, hardness: 0.1, color: { top: '#f0f4f8', side: '#f0f4f8', bottom: '#f0f4f8' } },
  [BLOCK_SNOW_BLOCK]:   { name: 'Snow Block',   solid: true,  transparent: false, hardness: 0.2, color: { top: '#f0f4f8', side: '#e8ecef', bottom: '#dde1e5' } },
  [BLOCK_GRAVEL]:       { name: 'Gravel',       solid: true,  transparent: false, hardness: 0.6, color: { top: '#9b9b9b', side: '#9b9b9b', bottom: '#9b9b9b' } },
  [BLOCK_GLASS]:        { name: 'Glass',        solid: true,  transparent: true,  hardness: 0.3, color: { top: '#a8d8ea', side: '#a8d8ea', bottom: '#a8d8ea' }, alpha: 0.4 },
  [BLOCK_BEDROCK]:      { name: 'Bedrock',      solid: true,  transparent: false, hardness: Infinity, color: { top: '#2c2c2c', side: '#2c2c2c', bottom: '#2c2c2c' } },
};

export function getBlock(id) {
  return Blocks[id] || Blocks[BLOCK_AIR];
}