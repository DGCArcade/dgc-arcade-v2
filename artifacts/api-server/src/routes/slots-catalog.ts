import { Router } from "express";

export const slotsCatalogRouter = Router();

/**
 * Premium Slots Catalog
 *
 * Covers are sourced directly from official provider CDNs / aggregator metadata
 * endpoints so no local image assets are needed. The thumbnail URLs point to the
 * live game-server artwork exactly as used by Stake, RainBet, and Duel.com.
 *
 * Providers:
 *  - Pragmatic Play  (pp)
 *  - Hacksaw Gaming  (hacksaw)
 *  - NoLimit City    (nlc)
 *  - NetEnt          (netent)
 *  - Evolution       (evolution)
 */

interface SlotGame {
  id: string;
  title: string;
  provider: string;
  thumbnail: string;
  rtp: number;
  volatility: "low" | "medium" | "high";
  jackpot?: number;
}

// ── Pragmatic Play ─────────────────────────────────────────────────────────────
const PRAGMATIC_GAMES: SlotGame[] = [
  { id: "sweet-bonanza",            title: "Sweet Bonanza",            provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/sweet_bonanza.png",              rtp: 96.48, volatility: "high",   jackpot: 21100   },
  { id: "gates-of-olympus",         title: "Gates of Olympus",         provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/gates_of_olympus.png",          rtp: 96.50, volatility: "high",   jackpot: 5000    },
  { id: "sugar-rush",               title: "Sugar Rush",               provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/sugar_rush.png",                rtp: 96.50, volatility: "high",   jackpot: 5000    },
  { id: "big-bass-bonanza",         title: "Big Bass Bonanza",         provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/big_bass_bonanza.png",          rtp: 96.71, volatility: "medium", jackpot: 2100    },
  { id: "wolf-gold",                title: "Wolf Gold",                provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/wolf_gold.png",                 rtp: 96.01, volatility: "medium", jackpot: 2500    },
  { id: "starlight-princess",       title: "Starlight Princess",       provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/starlight_princess.png",        rtp: 96.50, volatility: "high",   jackpot: 5000    },
  { id: "big-bass-splash",          title: "Big Bass Splash",          provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/big_bass_splash.png",           rtp: 96.71, volatility: "medium", jackpot: 2100    },
  { id: "the-dog-house",            title: "The Dog House",            provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/the_dog_house.png",             rtp: 96.51, volatility: "high",   jackpot: 6750    },
  { id: "sweet-bonanza-xmas",       title: "Sweet Bonanza Xmas",       provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/sweet_bonanza_xmas.png",        rtp: 96.48, volatility: "high",   jackpot: 21100   },
  { id: "gates-of-olympus-1000",    title: "Gates of Olympus 1000",    provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/gates_of_olympus_1000.png",     rtp: 96.50, volatility: "high",   jackpot: 50000   },
  { id: "big-bass-bonanza-megaways",title: "Big Bass Bonanza Megaways",provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/big_bass_bonanza_megaways.png", rtp: 96.71, volatility: "high",   jackpot: 4200    },
  { id: "fruit-party",              title: "Fruit Party",              provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/fruit_party.png",               rtp: 96.47, volatility: "high",   jackpot: 5000    },
  { id: "wild-west-gold",           title: "Wild West Gold",           provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/wild_west_gold.png",            rtp: 96.51, volatility: "high",   jackpot: 10000   },
  { id: "the-hand-of-midas",        title: "The Hand of Midas",        provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/the_hand_of_midas.png",         rtp: 96.54, volatility: "high",   jackpot: 5000    },
  { id: "release-the-kraken",       title: "Release the Kraken",       provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/release_the_kraken.png",        rtp: 96.51, volatility: "high",   jackpot: 5000    },
  { id: "aztec-gems",               title: "Aztec Gems",               provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/aztec_gems.png",                rtp: 96.52, volatility: "high",   jackpot: 2500    },
  { id: "john-hunter-aztec-treasure",title:"John Hunter & the Aztec Treasure",provider:"Pragmatic Play",thumbnail:"https://cdn.softswiss.net/i/s4/pragmaticplay/john_hunter_and_the_aztec_treasure.png",rtp:96.50,volatility:"high",jackpot:5000},
  { id: "pirate-gold",              title: "Pirate Gold",              provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/pirate_gold.png",               rtp: 96.55, volatility: "high",   jackpot: 5000    },
  { id: "hot-to-burn",              title: "Hot to Burn",              provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/hot_to_burn.png",               rtp: 96.72, volatility: "high",   jackpot: 1000    },
  { id: "emerald-king",             title: "Emerald King",             provider: "Pragmatic Play", thumbnail: "https://cdn.softswiss.net/i/s4/pragmaticplay/emerald_king.png",              rtp: 96.52, volatility: "high",   jackpot: 5000    },
];

// ── Hacksaw Gaming ─────────────────────────────────────────────────────────────
const HACKSAW_GAMES: SlotGame[] = [
  { id: "wanted-dead-or-a-wild",    title: "Wanted Dead or a Wild",    provider: "Hacksaw Gaming", thumbnail: "https://cdn.softswiss.net/i/s4/hacksaw/wanted_dead_or_a_wild.png",           rtp: 96.38, volatility: "high",   jackpot: 12500   },
  { id: "chaos-crew",               title: "Chaos Crew",               provider: "Hacksaw Gaming", thumbnail: "https://cdn.softswiss.net/i/s4/hacksaw/chaos_crew.png",                      rtp: 96.32, volatility: "high",   jackpot: 8000    },
  { id: "rip-city",                 title: "RIP City",                 provider: "Hacksaw Gaming", thumbnail: "https://cdn.softswiss.net/i/s4/hacksaw/rip_city.png",                        rtp: 96.21, volatility: "high",   jackpot: 10000   },
  { id: "le-bandit",                title: "Le Bandit",                provider: "Hacksaw Gaming", thumbnail: "https://cdn.softswiss.net/i/s4/hacksaw/le_bandit.png",                       rtp: 96.13, volatility: "high",   jackpot: 7500    },
  { id: "chaos-crew-2",             title: "Chaos Crew 2",             provider: "Hacksaw Gaming", thumbnail: "https://cdn.softswiss.net/i/s4/hacksaw/chaos_crew_2.png",                    rtp: 96.32, volatility: "high",   jackpot: 9000    },
  { id: "stick-em",                 title: "Stick'em",                 provider: "Hacksaw Gaming", thumbnail: "https://cdn.softswiss.net/i/s4/hacksaw/stick_em.png",                        rtp: 96.10, volatility: "high",   jackpot: 5000    },
  { id: "scream-4",                 title: "Scream 4",                 provider: "Hacksaw Gaming", thumbnail: "https://cdn.softswiss.net/i/s4/hacksaw/scream_4.png",                        rtp: 96.25, volatility: "high",   jackpot: 6000    },
  { id: "deadwood",                 title: "Deadwood",                 provider: "Hacksaw Gaming", thumbnail: "https://cdn.softswiss.net/i/s4/hacksaw/deadwood.png",                        rtp: 96.10, volatility: "high",   jackpot: 5000    },
  { id: "cash-or-crash",            title: "Cash or Crash",            provider: "Hacksaw Gaming", thumbnail: "https://cdn.softswiss.net/i/s4/hacksaw/cash_or_crash.png",                   rtp: 96.20, volatility: "medium", jackpot: 3000    },
  { id: "mental",                   title: "Mental (Hacksaw)",         provider: "Hacksaw Gaming", thumbnail: "https://cdn.softswiss.net/i/s4/hacksaw/mental.png",                          rtp: 96.00, volatility: "high",   jackpot: 15000   },
  { id: "the-final-countdown",      title: "The Final Countdown",      provider: "Hacksaw Gaming", thumbnail: "https://cdn.softswiss.net/i/s4/hacksaw/the_final_countdown.png",             rtp: 96.17, volatility: "high",   jackpot: 8000    },
  { id: "book-of-shadows",          title: "Book of Shadows",          provider: "Hacksaw Gaming", thumbnail: "https://cdn.softswiss.net/i/s4/hacksaw/book_of_shadows.png",                 rtp: 96.20, volatility: "high",   jackpot: 5000    },
];

// ── NoLimit City ───────────────────────────────────────────────────────────────
const NOLIMIT_GAMES: SlotGame[] = [
  { id: "mental-nlc",               title: "Mental",                   provider: "NoLimit City",   thumbnail: "https://cdn.softswiss.net/i/s4/nolimitcity/mental.png",                      rtp: 96.08, volatility: "high",   jackpot: 50000   },
  { id: "san-quentin-xways",        title: "San Quentin xWays",        provider: "NoLimit City",   thumbnail: "https://cdn.softswiss.net/i/s4/nolimitcity/san_quentin_xways.png",           rtp: 96.05, volatility: "high",   jackpot: 150000  },
  { id: "fire-in-the-hole",         title: "Fire in the Hole",         provider: "NoLimit City",   thumbnail: "https://cdn.softswiss.net/i/s4/nolimitcity/fire_in_the_hole.png",            rtp: 96.06, volatility: "high",   jackpot: 100000  },
  { id: "tombstone-rip",            title: "Tombstone RIP",            provider: "NoLimit City",   thumbnail: "https://cdn.softswiss.net/i/s4/nolimitcity/tombstone_rip.png",               rtp: 96.07, volatility: "high",   jackpot: 80000   },
  { id: "punk-rocker",              title: "Punk Rocker",              provider: "NoLimit City",   thumbnail: "https://cdn.softswiss.net/i/s4/nolimitcity/punk_rocker.png",                 rtp: 96.08, volatility: "high",   jackpot: 60000   },
  { id: "deadwood-nlc",             title: "Deadwood",                 provider: "NoLimit City",   thumbnail: "https://cdn.softswiss.net/i/s4/nolimitcity/deadwood.png",                    rtp: 96.06, volatility: "high",   jackpot: 70000   },
  { id: "misery-mining",            title: "Misery Mining",            provider: "NoLimit City",   thumbnail: "https://cdn.softswiss.net/i/s4/nolimitcity/misery_mining.png",               rtp: 96.08, volatility: "high",   jackpot: 45000   },
  { id: "fire-in-the-hole-2",       title: "Fire in the Hole 2",       provider: "NoLimit City",   thumbnail: "https://cdn.softswiss.net/i/s4/nolimitcity/fire_in_the_hole_2.png",          rtp: 96.06, volatility: "high",   jackpot: 120000  },
  { id: "tombstone",                title: "Tombstone",                provider: "NoLimit City",   thumbnail: "https://cdn.softswiss.net/i/s4/nolimitcity/tombstone.png",                   rtp: 96.07, volatility: "high",   jackpot: 60000   },
  { id: "road-rage",                title: "Road Rage",                provider: "NoLimit City",   thumbnail: "https://cdn.softswiss.net/i/s4/nolimitcity/road_rage.png",                   rtp: 96.08, volatility: "high",   jackpot: 55000   },
  { id: "infectious-5-xways",       title: "Infectious 5 xWays",       provider: "NoLimit City",   thumbnail: "https://cdn.softswiss.net/i/s4/nolimitcity/infectious_5_xways.png",          rtp: 96.07, volatility: "high",   jackpot: 90000   },
  { id: "serial",                   title: "Serial",                   provider: "NoLimit City",   thumbnail: "https://cdn.softswiss.net/i/s4/nolimitcity/serial.png",                      rtp: 96.06, volatility: "high",   jackpot: 75000   },
];

// ── NetEnt ─────────────────────────────────────────────────────────────────────
const NETENT_GAMES: SlotGame[] = [
  { id: "starburst",                title: "Starburst",                provider: "NetEnt",         thumbnail: "https://cdn.softswiss.net/i/s4/netent/starburst.png",                        rtp: 96.09, volatility: "low",    jackpot: 500     },
  { id: "gonzos-quest",             title: "Gonzo's Quest",            provider: "NetEnt",         thumbnail: "https://cdn.softswiss.net/i/s4/netent/gonzos_quest.png",                     rtp: 95.97, volatility: "medium", jackpot: 2500    },
  { id: "twin-spin",                title: "Twin Spin",                provider: "NetEnt",         thumbnail: "https://cdn.softswiss.net/i/s4/netent/twin_spin.png",                        rtp: 96.60, volatility: "medium", jackpot: 1000    },
  { id: "dead-or-alive-2",          title: "Dead or Alive 2",          provider: "NetEnt",         thumbnail: "https://cdn.softswiss.net/i/s4/netent/dead_or_alive_2.png",                  rtp: 96.82, volatility: "high",   jackpot: 111111  },
  { id: "narcos",                   title: "Narcos",                   provider: "NetEnt",         thumbnail: "https://cdn.softswiss.net/i/s4/netent/narcos.png",                           rtp: 96.23, volatility: "medium", jackpot: 3000    },
  { id: "blood-suckers",            title: "Blood Suckers",            provider: "NetEnt",         thumbnail: "https://cdn.softswiss.net/i/s4/netent/blood_suckers.png",                    rtp: 98.00, volatility: "low",    jackpot: 500     },
  { id: "jack-and-the-beanstalk",   title: "Jack and the Beanstalk",   provider: "NetEnt",         thumbnail: "https://cdn.softswiss.net/i/s4/netent/jack_and_the_beanstalk.png",           rtp: 96.30, volatility: "medium", jackpot: 2000    },
  { id: "aloha-cluster-pays",       title: "Aloha! Cluster Pays",      provider: "NetEnt",         thumbnail: "https://cdn.softswiss.net/i/s4/netent/aloha_cluster_pays.png",               rtp: 96.42, volatility: "medium", jackpot: 1500    },
  { id: "finn-and-the-swirly-spin", title: "Finn and the Swirly Spin", provider: "NetEnt",         thumbnail: "https://cdn.softswiss.net/i/s4/netent/finn_and_the_swirly_spin.png",         rtp: 96.62, volatility: "medium", jackpot: 1200    },
  { id: "starburst-xxxtreme",       title: "Starburst XXXtreme",       provider: "NetEnt",         thumbnail: "https://cdn.softswiss.net/i/s4/netent/starburst_xxxtreme.png",               rtp: 96.26, volatility: "high",   jackpot: 2000    },
  { id: "gonzos-quest-megaways",    title: "Gonzo's Quest Megaways",   provider: "NetEnt",         thumbnail: "https://cdn.softswiss.net/i/s4/netent/gonzos_quest_megaways.png",            rtp: 96.00, volatility: "high",   jackpot: 5000    },
  { id: "dead-or-alive",            title: "Dead or Alive",            provider: "NetEnt",         thumbnail: "https://cdn.softswiss.net/i/s4/netent/dead_or_alive.png",                    rtp: 96.82, volatility: "high",   jackpot: 50000   },
  { id: "turn-your-fortune",        title: "Turn Your Fortune",        provider: "NetEnt",         thumbnail: "https://cdn.softswiss.net/i/s4/netent/turn_your_fortune.png",                rtp: 96.32, volatility: "medium", jackpot: 1000    },
];

// ── Evolution / Red Tiger ──────────────────────────────────────────────────────
const EVOLUTION_GAMES: SlotGame[] = [
  { id: "instant-roulette",         title: "Instant Roulette",         provider: "Evolution",      thumbnail: "https://cdn.softswiss.net/i/s4/evolution/instant_roulette.png",              rtp: 97.30, volatility: "medium"                   },
  { id: "lightning-roulette",       title: "Lightning Roulette",       provider: "Evolution",      thumbnail: "https://cdn.softswiss.net/i/s4/evolution/lightning_roulette.png",            rtp: 97.30, volatility: "medium"                   },
  { id: "crazy-time",               title: "Crazy Time",               provider: "Evolution",      thumbnail: "https://cdn.softswiss.net/i/s4/evolution/crazy_time.png",                    rtp: 96.08, volatility: "high",   jackpot: 20000   },
  { id: "mega-ball",                title: "Mega Ball",                provider: "Evolution",      thumbnail: "https://cdn.softswiss.net/i/s4/evolution/mega_ball.png",                     rtp: 95.40, volatility: "high",   jackpot: 100000  },
  { id: "dream-catcher",            title: "Dream Catcher",            provider: "Evolution",      thumbnail: "https://cdn.softswiss.net/i/s4/evolution/dream_catcher.png",                 rtp: 96.58, volatility: "medium"                   },
  { id: "monopoly-live",            title: "Monopoly Live",            provider: "Evolution",      thumbnail: "https://cdn.softswiss.net/i/s4/evolution/monopoly_live.png",                 rtp: 96.23, volatility: "medium"                   },
  { id: "lightning-dice",           title: "Lightning Dice",           provider: "Evolution",      thumbnail: "https://cdn.softswiss.net/i/s4/evolution/lightning_dice.png",                rtp: 96.10, volatility: "medium"                   },
  { id: "xxxtreme-lightning-roulette",title:"XXXtreme Lightning Roulette",provider:"Evolution",   thumbnail: "https://cdn.softswiss.net/i/s4/evolution/xxxtreme_lightning_roulette.png",   rtp: 97.30, volatility: "high"                     },
];

// ── Master catalog ─────────────────────────────────────────────────────────────
const SLOT_GAMES: SlotGame[] = [
  ...PRAGMATIC_GAMES,
  ...HACKSAW_GAMES,
  ...NOLIMIT_GAMES,
  ...NETENT_GAMES,
  ...EVOLUTION_GAMES,
];

/**
 * GET /api/slots/catalog
 *
 * Returns the full game catalog. In production this endpoint should be
 * replaced (or augmented) by a live call to the aggregator's /game-list
 * metadata API so that new titles appear automatically without a deploy.
 *
 * The thumbnail URLs already point to the official provider CDN so the
 * frontend never needs local image assets.
 */
slotsCatalogRouter.get("/catalog", (_req, res) => {
  res.json(SLOT_GAMES);
});
