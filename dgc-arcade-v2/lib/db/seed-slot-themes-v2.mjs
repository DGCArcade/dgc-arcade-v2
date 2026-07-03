/**
 * DGC Arcade v2 — Slot Themes Seed v2
 * 10 professional themed slot games, Stake-style
 * Run: node seed-slot-themes-v2.mjs
 */
import pg from "pg";
const { Pool } = pg;

const isNeon = !!process.env.DATABASE_URL?.includes("neon.tech");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isNeon ? { rejectUnauthorized: false } : undefined,
});

const themes = [
  // ─── 1. Dragon's Fortune ────────────────────────────────────────────────
  {
    slug: "dragons-fortune",
    name: "Dragon's Fortune",
    config: {
      id: "dragons-fortune",
      name: "Dragon's Fortune",
      tagline: "Awaken the Dragon. Claim the Gold.",
      reels: 5, rows: 3,
      rtp: 96.5,
      volatility: "high",
      minBet: 0.10, maxBet: 1000,
      paylines: 20,
      symbols: [
        { id: "DRAGON",   label: "Dragon",       emoji: "🐉", color: "#ef4444", glow: "rgba(239,68,68,0.9)",   payouts: { 3: 15, 4: 75, 5: 750 } },
        { id: "GOLD",     label: "Gold Coin",    emoji: "🪙", color: "#f59e0b", glow: "rgba(245,158,11,0.9)",  payouts: { 3: 10, 4: 50, 5: 500 } },
        { id: "PEARL",    label: "Dragon Pearl", emoji: "💎", color: "#06b6d4", glow: "rgba(6,182,212,0.9)",   payouts: { 3: 6,  4: 30, 5: 200 } },
        { id: "SWORD",    label: "Sword",        emoji: "⚔️", color: "#a855f7", glow: "rgba(168,85,247,0.9)",  payouts: { 3: 4,  4: 15, 5: 80  } },
        { id: "FLAME",    label: "Flame",        emoji: "🔥", color: "#f97316", glow: "rgba(249,115,22,0.85)", payouts: { 3: 3,  4: 10, 5: 40  } },
        { id: "CHERRY",   label: "Cherry",       emoji: "🍒", color: "#e11d48", glow: "rgba(225,29,72,0.8)",   payouts: { 3: 2,  4: 6,  5: 20  } },
        { id: "WILD",     label: "Wild Dragon",  emoji: "🌟", color: "#fbbf24", glow: "rgba(251,191,36,0.95)", payouts: {}, isWild: true },
        { id: "SCATTER",  label: "Dragon Egg",   emoji: "🥚", color: "#84cc16", glow: "rgba(132,204,22,0.9)",  payouts: {}, isScatter: true },
      ],
      jackpots: { mini: 50, minor: 250, major: 1250, grand: 5000 },
      features: ["free_spins", "wild_multiplier", "dragon_bonus"],
      coverGradient: ["#1a0000", "#3d0000", "#7f1d1d"],
      accentColor: "#ef4444",
    },
    assets: {
      background: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1200&q=80",
      icon: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80",
      coverEmoji: "🐉",
    },
    active: "true",
  },

  // ─── 2. Neon Cyber ──────────────────────────────────────────────────────
  {
    slug: "neon-cyber",
    name: "Neon Cyber",
    config: {
      id: "neon-cyber",
      name: "Neon Cyber",
      tagline: "Hack the Matrix. Win the Future.",
      reels: 5, rows: 4,
      rtp: 97.2,
      volatility: "medium",
      minBet: 0.10, maxBet: 2000,
      paylines: 40,
      symbols: [
        { id: "SEVEN",    label: "Cyber 7",    emoji: "7️⃣", color: "#06b6d4", glow: "rgba(6,182,212,0.95)",   payouts: { 3: 20, 4: 100, 5: 1000 } },
        { id: "DIAMOND",  label: "Data Gem",   emoji: "💠", color: "#3b82f6", glow: "rgba(59,130,246,0.9)",   payouts: { 3: 10, 4: 50,  5: 500  } },
        { id: "CIRCUIT",  label: "Circuit",    emoji: "⚡", color: "#a855f7", glow: "rgba(168,85,247,0.9)",   payouts: { 3: 6,  4: 25,  5: 150  } },
        { id: "ROBOT",    label: "Bot",        emoji: "🤖", color: "#22c55e", glow: "rgba(34,197,94,0.85)",   payouts: { 3: 4,  4: 15,  5: 75   } },
        { id: "GLITCH",   label: "Glitch",     emoji: "📡", color: "#f59e0b", glow: "rgba(245,158,11,0.85)",  payouts: { 3: 3,  4: 10,  5: 40   } },
        { id: "PIXEL",    label: "Pixel",      emoji: "🔷", color: "#67e8f9", glow: "rgba(103,232,249,0.8)",  payouts: { 3: 2,  4: 6,   5: 20   } },
        { id: "WILD",     label: "Glitch Wild",emoji: "🌐", color: "#c084fc", glow: "rgba(192,132,252,0.95)", payouts: {}, isWild: true },
        { id: "SCATTER",  label: "Hack Bonus", emoji: "💻", color: "#4ade80", glow: "rgba(74,222,128,0.9)",   payouts: {}, isScatter: true },
      ],
      jackpots: { mini: 50, minor: 200, major: 1000, grand: 10000 },
      features: ["expanding_wilds", "cyber_bonus", "free_spins"],
      coverGradient: ["#000814", "#001233", "#023e8a"],
      accentColor: "#06b6d4",
    },
    assets: {
      background: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=80",
      icon: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80",
      coverEmoji: "⚡",
    },
    active: "true",
  },

  // ─── 3. Pharaoh's Riches ────────────────────────────────────────────────
  {
    slug: "pharaohs-riches",
    name: "Pharaoh's Riches",
    config: {
      id: "pharaohs-riches",
      name: "Pharaoh's Riches",
      tagline: "Unearth Ancient Treasures.",
      reels: 5, rows: 3,
      rtp: 96.0,
      volatility: "medium",
      minBet: 0.10, maxBet: 500,
      paylines: 25,
      symbols: [
        { id: "PHARAOH",  label: "Pharaoh",    emoji: "👑", color: "#f59e0b", glow: "rgba(245,158,11,0.95)",  payouts: { 3: 12, 4: 60, 5: 600 } },
        { id: "SCARAB",   label: "Scarab",     emoji: "🪲", color: "#22c55e", glow: "rgba(34,197,94,0.9)",    payouts: { 3: 8,  4: 40, 5: 300 } },
        { id: "EYE",      label: "Eye of Ra",  emoji: "👁️", color: "#ef4444", glow: "rgba(239,68,68,0.9)",    payouts: { 3: 5,  4: 20, 5: 100 } },
        { id: "ANKH",     label: "Ankh",       emoji: "☥", color: "#a855f7", glow: "rgba(168,85,247,0.85)",  payouts: { 3: 4,  4: 12, 5: 60  } },
        { id: "PYRAMID",  label: "Pyramid",    emoji: "🔺", color: "#fbbf24", glow: "rgba(251,191,36,0.85)",  payouts: { 3: 3,  4: 8,  5: 30  } },
        { id: "SAND",     label: "Sand",       emoji: "⭐", color: "#d97706", glow: "rgba(217,119,6,0.8)",    payouts: { 3: 2,  4: 5,  5: 15  } },
        { id: "WILD",     label: "Golden Wild",emoji: "🌟", color: "#fbbf24", glow: "rgba(251,191,36,0.95)",  payouts: {}, isWild: true },
        { id: "SCATTER",  label: "Sphinx",     emoji: "🏛️", color: "#84cc16", glow: "rgba(132,204,22,0.9)",   payouts: {}, isScatter: true },
      ],
      jackpots: { mini: 50, minor: 250, major: 1250, grand: 5000 },
      features: ["free_spins", "expanding_wilds", "pharaoh_bonus"],
      coverGradient: ["#1a0e00", "#3d2200", "#78350f"],
      accentColor: "#f59e0b",
    },
    assets: {
      background: "https://images.unsplash.com/photo-1539768942893-daf53e448371?w=1200&q=80",
      icon: "https://images.unsplash.com/photo-1568515387631-8b650bbcdb90?w=400&q=80",
      coverEmoji: "👑",
    },
    active: "true",
  },

  // ─── 4. Street Gold (DGC Original) ──────────────────────────────────────
  {
    slug: "street-gold",
    name: "Street Gold",
    config: {
      id: "street-gold",
      name: "Street Gold",
      tagline: "The Grind Never Stops. The Gold Never Lies.",
      reels: 5, rows: 3,
      rtp: 96.8,
      volatility: "high",
      minBet: 0.25, maxBet: 2500,
      paylines: 20,
      symbols: [
        { id: "DGC",      label: "DGC",        emoji: "🏆", color: "#f59e0b", glow: "rgba(245,158,11,0.95)",  payouts: { 3: 20, 4: 80, 5: 500 } },
        { id: "CHAIN",    label: "Chain",      emoji: "⛓️", color: "#a855f7", glow: "rgba(168,85,247,0.9)",   payouts: { 3: 10, 4: 40, 5: 200 } },
        { id: "DIAMOND",  label: "Diamond",    emoji: "💎", color: "#06b6d4", glow: "rgba(6,182,212,0.9)",    payouts: { 3: 6,  4: 25, 5: 100 } },
        { id: "MONEY",    label: "Money Bag",  emoji: "💰", color: "#22c55e", glow: "rgba(34,197,94,0.85)",   payouts: { 3: 4,  4: 15, 5: 60  } },
        { id: "CROWN",    label: "Crown",      emoji: "👑", color: "#fbbf24", glow: "rgba(251,191,36,0.85)",  payouts: { 3: 3,  4: 10, 5: 35  } },
        { id: "STAR",     label: "Star",       emoji: "⭐", color: "#eab308", glow: "rgba(234,179,8,0.8)",    payouts: { 3: 2,  4: 6,  5: 18  } },
        { id: "WILD",     label: "Wild",       emoji: "🌟", color: "#fbbf24", glow: "rgba(251,191,36,0.95)",  payouts: {}, isWild: true },
        { id: "SCATTER",  label: "Bonus",      emoji: "🎯", color: "#ef4444", glow: "rgba(239,68,68,0.9)",    payouts: {}, isScatter: true },
      ],
      jackpots: { mini: 50, minor: 250, major: 1250, grand: 5000 },
      features: ["free_spins", "multiplier_wild", "street_bonus"],
      coverGradient: ["#0a0a0a", "#1a1a00", "#2d2d00"],
      accentColor: "#f59e0b",
    },
    assets: {
      background: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1200&q=80",
      icon: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80",
      coverEmoji: "🏆",
    },
    active: "true",
  },

  // ─── 5. Ocean Depths ────────────────────────────────────────────────────
  {
    slug: "ocean-depths",
    name: "Ocean Depths",
    config: {
      id: "ocean-depths",
      name: "Ocean Depths",
      tagline: "Dive Deep. Win Big.",
      reels: 5, rows: 3,
      rtp: 96.3,
      volatility: "medium",
      minBet: 0.10, maxBet: 750,
      paylines: 20,
      symbols: [
        { id: "WHALE",    label: "Whale",      emoji: "🐋", color: "#0ea5e9", glow: "rgba(14,165,233,0.95)",  payouts: { 3: 12, 4: 60, 5: 600 } },
        { id: "SHARK",    label: "Shark",      emoji: "🦈", color: "#06b6d4", glow: "rgba(6,182,212,0.9)",    payouts: { 3: 8,  4: 35, 5: 250 } },
        { id: "TREASURE", label: "Treasure",   emoji: "🪙", color: "#f59e0b", glow: "rgba(245,158,11,0.9)",   payouts: { 3: 5,  4: 20, 5: 100 } },
        { id: "PEARL",    label: "Pearl",      emoji: "🫧", color: "#e0f2fe", glow: "rgba(224,242,254,0.85)", payouts: { 3: 4,  4: 12, 5: 50  } },
        { id: "CORAL",    label: "Coral",      emoji: "🪸", color: "#f97316", glow: "rgba(249,115,22,0.85)",  payouts: { 3: 3,  4: 8,  5: 30  } },
        { id: "FISH",     label: "Fish",       emoji: "🐠", color: "#22c55e", glow: "rgba(34,197,94,0.8)",    payouts: { 3: 2,  4: 5,  5: 15  } },
        { id: "WILD",     label: "Kraken",     emoji: "🦑", color: "#7c3aed", glow: "rgba(124,58,237,0.95)",  payouts: {}, isWild: true },
        { id: "SCATTER",  label: "Anchor",     emoji: "⚓", color: "#64748b", glow: "rgba(100,116,139,0.9)",  payouts: {}, isScatter: true },
      ],
      jackpots: { mini: 50, minor: 250, major: 1250, grand: 5000 },
      features: ["free_spins", "depth_multiplier", "kraken_wild"],
      coverGradient: ["#001220", "#003366", "#0066cc"],
      accentColor: "#0ea5e9",
    },
    assets: {
      background: "https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=1200&q=80",
      icon: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&q=80",
      coverEmoji: "🌊",
    },
    active: "true",
  },

  // ─── 6. Wolf Pack ───────────────────────────────────────────────────────
  {
    slug: "wolf-pack",
    name: "Wolf Pack",
    config: {
      id: "wolf-pack",
      name: "Wolf Pack",
      tagline: "Run with the Pack. Hunt the Jackpot.",
      reels: 5, rows: 3,
      rtp: 96.7,
      volatility: "high",
      minBet: 0.20, maxBet: 1000,
      paylines: 25,
      symbols: [
        { id: "WOLF",     label: "Alpha Wolf",  emoji: "🐺", color: "#94a3b8", glow: "rgba(148,163,184,0.95)", payouts: { 3: 15, 4: 75, 5: 750 } },
        { id: "MOON",     label: "Full Moon",   emoji: "🌕", color: "#fbbf24", glow: "rgba(251,191,36,0.9)",   payouts: { 3: 10, 4: 50, 5: 400 } },
        { id: "HOWL",     label: "Howl",        emoji: "🌙", color: "#818cf8", glow: "rgba(129,140,248,0.9)",  payouts: { 3: 6,  4: 25, 5: 150 } },
        { id: "PAW",      label: "Paw",         emoji: "🐾", color: "#a78bfa", glow: "rgba(167,139,250,0.85)", payouts: { 3: 4,  4: 15, 5: 60  } },
        { id: "TREE",     label: "Pine",        emoji: "🌲", color: "#22c55e", glow: "rgba(34,197,94,0.85)",   payouts: { 3: 3,  4: 10, 5: 35  } },
        { id: "SNOW",     label: "Snow",        emoji: "❄️", color: "#bae6fd", glow: "rgba(186,230,253,0.8)",  payouts: { 3: 2,  4: 6,  5: 18  } },
        { id: "WILD",     label: "Pack Wild",   emoji: "🌟", color: "#f59e0b", glow: "rgba(245,158,11,0.95)",  payouts: {}, isWild: true },
        { id: "SCATTER",  label: "Den Bonus",   emoji: "🏔️", color: "#64748b", glow: "rgba(100,116,139,0.9)",  payouts: {}, isScatter: true },
      ],
      jackpots: { mini: 50, minor: 250, major: 1250, grand: 5000 },
      features: ["free_spins", "pack_multiplier", "howl_bonus"],
      coverGradient: ["#0a0a14", "#1a1a2e", "#16213e"],
      accentColor: "#818cf8",
    },
    assets: {
      background: "https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=1200&q=80",
      icon: "https://images.unsplash.com/photo-1551969014-7d2c4cddf0b6?w=400&q=80",
      coverEmoji: "🐺",
    },
    active: "true",
  },

  // ─── 7. Cosmic Cash ─────────────────────────────────────────────────────
  {
    slug: "cosmic-cash",
    name: "Cosmic Cash",
    config: {
      id: "cosmic-cash",
      name: "Cosmic Cash",
      tagline: "Reach for the Stars. Grab the Jackpot.",
      reels: 5, rows: 3,
      rtp: 97.0,
      volatility: "medium",
      minBet: 0.10, maxBet: 1500,
      paylines: 30,
      symbols: [
        { id: "PLANET",   label: "Planet",     emoji: "🪐", color: "#a855f7", glow: "rgba(168,85,247,0.95)",  payouts: { 3: 12, 4: 60, 5: 600 } },
        { id: "ROCKET",   label: "Rocket",     emoji: "🚀", color: "#06b6d4", glow: "rgba(6,182,212,0.9)",    payouts: { 3: 8,  4: 40, 5: 300 } },
        { id: "STAR",     label: "Star",       emoji: "⭐", color: "#fbbf24", glow: "rgba(251,191,36,0.9)",   payouts: { 3: 5,  4: 20, 5: 100 } },
        { id: "GALAXY",   label: "Galaxy",     emoji: "🌌", color: "#818cf8", glow: "rgba(129,140,248,0.85)", payouts: { 3: 4,  4: 15, 5: 60  } },
        { id: "COMET",    label: "Comet",      emoji: "☄️", color: "#f97316", glow: "rgba(249,115,22,0.85)",  payouts: { 3: 3,  4: 10, 5: 35  } },
        { id: "MOON",     label: "Moon",       emoji: "🌙", color: "#e2e8f0", glow: "rgba(226,232,240,0.8)",  payouts: { 3: 2,  4: 6,  5: 18  } },
        { id: "WILD",     label: "Black Hole", emoji: "🌀", color: "#c084fc", glow: "rgba(192,132,252,0.95)", payouts: {}, isWild: true },
        { id: "SCATTER",  label: "Nebula",     emoji: "💫", color: "#4ade80", glow: "rgba(74,222,128,0.9)",   payouts: {}, isScatter: true },
      ],
      jackpots: { mini: 50, minor: 250, major: 1250, grand: 5000 },
      features: ["free_spins", "cosmic_multiplier", "black_hole_wild"],
      coverGradient: ["#000008", "#0d0020", "#1a0040"],
      accentColor: "#a855f7",
    },
    assets: {
      background: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1200&q=80",
      icon: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=400&q=80",
      coverEmoji: "🚀",
    },
    active: "true",
  },

  // ─── 8. Fire & Ice ──────────────────────────────────────────────────────
  {
    slug: "fire-and-ice",
    name: "Fire & Ice",
    config: {
      id: "fire-and-ice",
      name: "Fire & Ice",
      tagline: "Two Forces. One Jackpot.",
      reels: 5, rows: 3,
      rtp: 96.2,
      volatility: "high",
      minBet: 0.20, maxBet: 2000,
      paylines: 20,
      symbols: [
        { id: "FIRE",     label: "Fire",       emoji: "🔥", color: "#ef4444", glow: "rgba(239,68,68,0.95)",   payouts: { 3: 15, 4: 75, 5: 750 } },
        { id: "ICE",      label: "Ice",        emoji: "🧊", color: "#7dd3fc", glow: "rgba(125,211,252,0.95)", payouts: { 3: 15, 4: 75, 5: 750 } },
        { id: "VOLCANO",  label: "Volcano",    emoji: "🌋", color: "#f97316", glow: "rgba(249,115,22,0.9)",   payouts: { 3: 8,  4: 35, 5: 250 } },
        { id: "SNOWFLAKE",label: "Snowflake",  emoji: "❄️", color: "#bae6fd", glow: "rgba(186,230,253,0.9)",  payouts: { 3: 8,  4: 35, 5: 250 } },
        { id: "LAVA",     label: "Lava",       emoji: "🫧", color: "#dc2626", glow: "rgba(220,38,38,0.85)",   payouts: { 3: 4,  4: 15, 5: 60  } },
        { id: "FROST",    label: "Frost",      emoji: "🌨️", color: "#e0f2fe", glow: "rgba(224,242,254,0.8)",  payouts: { 3: 4,  4: 15, 5: 60  } },
        { id: "WILD",     label: "Fusion Wild",emoji: "⚡", color: "#a855f7", glow: "rgba(168,85,247,0.95)",  payouts: {}, isWild: true },
        { id: "SCATTER",  label: "Clash",      emoji: "💥", color: "#fbbf24", glow: "rgba(251,191,36,0.9)",   payouts: {}, isScatter: true },
      ],
      jackpots: { mini: 50, minor: 250, major: 1250, grand: 5000 },
      features: ["free_spins", "dual_multiplier", "fusion_bonus"],
      coverGradient: ["#1a0000", "#000033", "#1a0033"],
      accentColor: "#ef4444",
    },
    assets: {
      background: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&q=80",
      icon: "https://images.unsplash.com/photo-1505765050516-f72dcac9c60e?w=400&q=80",
      coverEmoji: "🔥",
    },
    active: "true",
  },

  // ─── 9. Diamond Vault ───────────────────────────────────────────────────
  {
    slug: "diamond-vault",
    name: "Diamond Vault",
    config: {
      id: "diamond-vault",
      name: "Diamond Vault",
      tagline: "The Vault is Open. The Diamonds are Yours.",
      reels: 5, rows: 3,
      rtp: 96.9,
      volatility: "medium",
      minBet: 0.10, maxBet: 5000,
      paylines: 25,
      symbols: [
        { id: "DIAMOND",  label: "Diamond",    emoji: "💎", color: "#06b6d4", glow: "rgba(6,182,212,0.95)",   payouts: { 3: 15, 4: 75, 5: 750 } },
        { id: "VAULT",    label: "Vault",      emoji: "🏦", color: "#f59e0b", glow: "rgba(245,158,11,0.9)",   payouts: { 3: 10, 4: 50, 5: 400 } },
        { id: "CROWN",    label: "Crown",      emoji: "👑", color: "#a855f7", glow: "rgba(168,85,247,0.9)",   payouts: { 3: 6,  4: 25, 5: 150 } },
        { id: "RING",     label: "Ring",       emoji: "💍", color: "#ec4899", glow: "rgba(236,72,153,0.85)",  payouts: { 3: 4,  4: 15, 5: 60  } },
        { id: "COIN",     label: "Gold Coin",  emoji: "🪙", color: "#fbbf24", glow: "rgba(251,191,36,0.85)",  payouts: { 3: 3,  4: 10, 5: 35  } },
        { id: "KEY",      label: "Key",        emoji: "🗝️", color: "#94a3b8", glow: "rgba(148,163,184,0.8)",  payouts: { 3: 2,  4: 6,  5: 18  } },
        { id: "WILD",     label: "Vault Wild", emoji: "🌟", color: "#fbbf24", glow: "rgba(251,191,36,0.95)",  payouts: {}, isWild: true },
        { id: "SCATTER",  label: "Safe",       emoji: "🔐", color: "#22c55e", glow: "rgba(34,197,94,0.9)",    payouts: {}, isScatter: true },
      ],
      jackpots: { mini: 50, minor: 250, major: 1250, grand: 5000 },
      features: ["free_spins", "vault_bonus", "diamond_multiplier"],
      coverGradient: ["#000a14", "#001a33", "#003366"],
      accentColor: "#06b6d4",
    },
    assets: {
      background: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80",
      icon: "https://images.unsplash.com/photo-1515630278258-407f994692db?w=400&q=80",
      coverEmoji: "💎",
    },
    active: "true",
  },

  // ─── 10. Lucky Sevens ───────────────────────────────────────────────────
  {
    slug: "lucky-sevens",
    name: "Lucky Sevens",
    config: {
      id: "lucky-sevens",
      name: "Lucky Sevens",
      tagline: "Classic Slots. Legendary Wins.",
      reels: 3, rows: 3,
      rtp: 97.5,
      volatility: "low",
      minBet: 0.10, maxBet: 500,
      paylines: 5,
      symbols: [
        { id: "SEVEN",    label: "Lucky 7",    emoji: "7️⃣", color: "#ef4444", glow: "rgba(239,68,68,0.95)",   payouts: { 3: 50 } },
        { id: "BAR3",     label: "Triple Bar", emoji: "🎰", color: "#f59e0b", glow: "rgba(245,158,11,0.9)",   payouts: { 3: 20 } },
        { id: "BAR2",     label: "Double Bar", emoji: "📊", color: "#a855f7", glow: "rgba(168,85,247,0.9)",   payouts: { 3: 10 } },
        { id: "BAR1",     label: "Single Bar", emoji: "📈", color: "#06b6d4", glow: "rgba(6,182,212,0.85)",   payouts: { 3: 5  } },
        { id: "BELL",     label: "Bell",       emoji: "🔔", color: "#fbbf24", glow: "rgba(251,191,36,0.85)",  payouts: { 3: 4  } },
        { id: "CHERRY",   label: "Cherry",     emoji: "🍒", color: "#e11d48", glow: "rgba(225,29,72,0.8)",    payouts: { 3: 3  } },
        { id: "WILD",     label: "Wild",       emoji: "🌟", color: "#fbbf24", glow: "rgba(251,191,36,0.95)",  payouts: {}, isWild: true },
      ],
      jackpots: { mini: 50, minor: 250, major: 1250, grand: 5000 },
      features: ["classic_mode", "lucky_bonus"],
      coverGradient: ["#1a0000", "#2d0000", "#4c0519"],
      accentColor: "#ef4444",
    },
    assets: {
      background: "https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=1200&q=80",
      icon: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80",
      coverEmoji: "7️⃣",
    },
    active: "true",
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log(`Seeding ${themes.length} slot themes v2 into database…`);
    for (const theme of themes) {
      const result = await client.query(
        `INSERT INTO slot_themes (slug, name, config, assets, active)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           config = EXCLUDED.config,
           assets = EXCLUDED.assets,
           active = EXCLUDED.active,
           updated_at = NOW()
         RETURNING id, slug`,
        [
          theme.slug,
          theme.name,
          JSON.stringify(theme.config),
          JSON.stringify(theme.assets),
          theme.active,
        ],
      );
      console.log(`  ✓ ${theme.name} (${theme.slug}) — id: ${result.rows[0].id}`);
    }
    const { rows } = await client.query(
      `SELECT id, slug, name, active FROM slot_themes ORDER BY id`,
    );
    console.log(`\nFinal slot_themes table (${rows.length} rows):`);
    for (const row of rows) {
      console.log(`  [${row.id}] ${row.name} (${row.slug}) — active: ${row.active}`);
    }
    console.log("\nDone.");
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
