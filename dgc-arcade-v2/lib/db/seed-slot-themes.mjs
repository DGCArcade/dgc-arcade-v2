/**
 * Seed script: inserts default slot themes into the slot_themes table.
 * Idempotent — uses ON CONFLICT (slug) DO NOTHING so re-runs are safe.
 *
 * Usage (dev):   pnpm --filter @workspace/db run seed:slot-themes
 * Usage (prod):  DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/db run seed:slot-themes
 */

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const isNeon = DATABASE_URL.includes("neon.tech");
const ssl = isNeon ? { rejectUnauthorized: false } : undefined;

const pool = new Pool({ connectionString: DATABASE_URL, ssl });

const themes = [
  {
    slug: "classic-vegas",
    name: "Classic Vegas",
    config: {
      id: "classic-vegas",
      name: "Classic Vegas",
      reels: 3,
      rows: 3,
      symbols: [
        { id: "CHERRY",  name: "Cherry",  image: "cherry.png",  payouts: { 3: 3 } },
        { id: "LEMON",   name: "Lemon",   image: "lemon.png",   payouts: { 3: 3 } },
        { id: "BELL",    name: "Bell",    image: "bell.png",    payouts: { 3: 4 } },
        { id: "BAR",     name: "Bar",     image: "bar.png",     payouts: { 3: 5 } },
        { id: "DIAMOND", name: "Diamond", image: "diamond.png", payouts: { 3: 10 } },
        { id: "WILD",    name: "Wild",    image: "wild.png",    payouts: { 3: 15 }, isWild: true },
        { id: "SEVEN",   name: "Seven",   image: "seven.png",   payouts: { 3: 20 } },
      ],
      paylines: [
        [1, 1, 1],
        [0, 0, 0],
        [2, 2, 2],
      ],
      rtp: 96.0,
      minBet: 0.1,
      maxBet: 500,
      jackpots: { mini: 10, minor: 50, major: 250, grand: 1000 },
      themes: {
        background: "vegas-bg.jpg",
        music: "vegas-theme.mp3",
        spinSound: "spin.wav",
        winSound: "win.wav",
        bonusSound: "bonus.wav",
        particles: { win: "gold-particles.json" },
      },
    },
    assets: {
      background: "https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=1200&q=80",
      icon: "https://images.unsplash.com/photo-1518895312237-a9e23508077d?w=400&q=80",
    },
    active: "true",
  },

  {
    slug: "dragon-realm",
    name: "Dragon Realm",
    config: {
      id: "dragon-realm",
      name: "Dragon Realm",
      reels: 5,
      rows: 3,
      symbols: [
        { id: "DRAGON",   name: "Dragon",      image: "dragon.png",   payouts: { 3: 10, 4: 50, 5: 500 } },
        { id: "SEVEN",    name: "Fire Seven",  image: "seven.png",    payouts: { 3: 20, 4: 80, 5: 800 } },
        { id: "EGG",      name: "Dragon Egg",  image: "egg.png",      payouts: { 3: 5,  4: 20, 5: 100 } },
        { id: "DIAMOND",  name: "Gem",         image: "diamond.png",  payouts: { 3: 3,  4: 12, 5: 60  } },
        { id: "TREASURE", name: "Treasure",    image: "treasure.png", payouts: { 3: 2,  4: 8,  5: 40  } },
        { id: "WILD",     name: "Dragon Wild", image: "wild.png",     payouts: {}, isWild: true },
        { id: "SCATTER",  name: "Orb Scatter", image: "scatter.png",  payouts: {}, isScatter: true },
      ],
      paylines: [
        [1, 1, 1, 1, 1],
        [0, 0, 0, 0, 0],
        [2, 2, 2, 2, 2],
        [0, 1, 2, 1, 0],
        [2, 1, 0, 1, 2],
      ],
      rtp: 96.5,
      minBet: 0.1,
      maxBet: 1000,
      jackpots: { mini: 25, minor: 100, major: 500, grand: 5000 },
      themes: {
        background: "dragon-bg.jpg",
        music: "dragon-theme.mp3",
        spinSound: "spin.wav",
        winSound: "win.wav",
        bonusSound: "bonus.wav",
        particles: { win: "fire-particles.json" },
      },
    },
    assets: {
      background: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1200&q=80",
      icon: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80",
    },
    active: "true",
  },

  {
    slug: "neon-cyber",
    name: "Neon Cyber",
    config: {
      id: "neon-cyber",
      name: "Neon Cyber",
      reels: 5,
      rows: 4,
      symbols: [
        { id: "SEVEN",   name: "Cyber 7",     image: "seven.png",   payouts: { 3: 20, 4: 100, 5: 1000 } },
        { id: "DIAMOND", name: "Data Gem",    image: "diamond.png", payouts: { 3: 10, 4: 50,  5: 500  } },
        { id: "WILD",    name: "Glitch",      image: "wild.png",    payouts: { 3: 15, 4: 80,  5: 800  }, isWild: true },
        { id: "BELL",    name: "Pulse",       image: "bell.png",    payouts: { 3: 4,  4: 16,  5: 80   } },
        { id: "BAR",     name: "Code Bar",    image: "bar.png",     payouts: { 3: 5,  4: 20,  5: 100  } },
        { id: "LEMON",   name: "Bit Lemon",   image: "lemon.png",   payouts: { 3: 3,  4: 10,  5: 50   } },
        { id: "CHERRY",  name: "Neon Cherry", image: "cherry.png",  payouts: { 3: 3,  4: 10,  5: 50   } },
        { id: "SCATTER", name: "Hack Bonus",  image: "scatter.png", payouts: {}, isScatter: true },
      ],
      paylines: [
        [1, 1, 1, 1, 1],
        [0, 0, 0, 0, 0],
        [2, 2, 2, 2, 2],
        [3, 3, 3, 3, 3],
        [0, 1, 2, 1, 0],
        [3, 2, 1, 2, 3],
        [1, 0, 1, 0, 1],
        [2, 3, 2, 3, 2],
      ],
      rtp: 97.2,
      minBet: 0.1,
      maxBet: 2000,
      jackpots: { mini: 50, minor: 200, major: 1000, grand: 10000 },
      themes: {
        background: "cyber-bg.jpg",
        music: "cyber-theme.mp3",
        spinSound: "cyber-spin.wav",
        winSound: "cyber-win.wav",
        bonusSound: "cyber-bonus.wav",
        particles: { win: "neon-particles.json" },
      },
    },
    assets: {
      background: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=80",
      icon: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80",
    },
    active: "true",
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log(`Seeding ${themes.length} slot themes into ${isNeon ? "PRODUCTION (Neon)" : "dev"} database…`);

    for (const theme of themes) {
      const result = await client.query(
        `INSERT INTO slot_themes (slug, name, config, assets, active)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
         ON CONFLICT (slug) DO NOTHING
         RETURNING id, slug`,
        [
          theme.slug,
          theme.name,
          JSON.stringify(theme.config),
          JSON.stringify(theme.assets),
          theme.active,
        ],
      );

      if (result.rowCount > 0) {
        console.log(`  ✓ Inserted: ${theme.name} (slug: ${theme.slug}, id: ${result.rows[0].id})`);
      } else {
        console.log(`  – Skipped (already exists): ${theme.name} (slug: ${theme.slug})`);
      }
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
