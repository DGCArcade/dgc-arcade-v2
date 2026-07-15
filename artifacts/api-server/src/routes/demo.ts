import { Router } from "express";
import { signToken } from "../middlewares/auth.js";
import { getCryptoPrice } from "../lib/price-service.js";

export const demoRouter = Router();

// Generate a fake demo user with $1M in a random crypto coin
function generateDemoUser() {
  const supportedCoins = ["BTC", "ETH", "LTC", "USDT"];
  const randomCoin = supportedCoins[Math.floor(Math.random() * supportedCoins.length)];
  
  return {
    id: 999999, // Special demo ID
    username: `Demo_${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    email: null,
    balance: "0",
    avatarUrl: null,
    totalBets: Math.floor(Math.random() * 50),
    totalWon: String(Math.floor(Math.random() * 50000)),
    role: "player" as const,
    isBanned: false,
    createdAt: new Date().toISOString(),
    accountType: "player" as const,
    withdrawalsEnabled: false, // Demo accounts cannot withdraw
    referralCode: "DEMO0000",
    totalWageredAmount: String(Math.floor(Math.random() * 100000)),
    wagerRequirement: "0",
    lastLoginAt: new Date().toISOString(),
    telegramUsername: null,
    rakebackClaimed: "0",
    signupBonus: "0",
    bonusWagered: "0",
    emailVerified: true,
    demoCoin: randomCoin,
    demoBalance: 1000000, // $1M
  };
}

// Generate fictitious live bets for demo mode
function generateFakeLiveBets(count: number = 5) {
  const games = ["Crash", "Mines", "Chicken Road", "Coin Flip", "Dice", "Blackjack", "Roulette", "Hi-Lo", "Keno", "Horse Race"];
  const bets = [];
  
  for (let i = 0; i < count; i++) {
    const game = games[Math.floor(Math.random() * games.length)];
    const amount = Math.floor(Math.random() * 1000) + 10;
    const multiplier = (Math.random() * 10 + 1).toFixed(2);
    const won = Math.random() > 0.5;
    const payout = won ? amount * parseFloat(multiplier) : 0;
    
    bets.push({
      id: Math.floor(Math.random() * 1000000),
      username: `Player_${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      game,
      amount: amount.toFixed(2),
      multiplier: parseFloat(multiplier),
      payout: payout.toFixed(2),
      won,
      timestamp: new Date(Date.now() - Math.random() * 60000).toISOString(),
    });
  }
  
  return bets;
}

// POST /api/demo/login - Fake demo login
demoRouter.post("/login", async (req, res) => {
  try {
    const demoUser = generateDemoUser();
    const token = signToken({ userId: demoUser.id, username: demoUser.username, role: demoUser.role });
    
    res.json({
      user: {
        id: demoUser.id,
        username: demoUser.username,
        balance: demoUser.demoBalance,
        cryptoBalances: [
          {
            currency: demoUser.demoCoin,
            amount: demoUser.demoBalance / 50000, // Approximate crypto amount
            price: 50000,
            usdValue: demoUser.demoBalance,
          }
        ],
        avatarUrl: demoUser.avatarUrl,
        totalBets: demoUser.totalBets,
        totalWon: parseFloat(demoUser.totalWon),
        role: demoUser.role,
        isBanned: false,
        createdAt: demoUser.createdAt,
        accountType: demoUser.accountType,
        withdrawalsEnabled: false,
        referralCode: demoUser.referralCode,
        totalWageredAmount: parseFloat(demoUser.totalWageredAmount),
        wagerRequirement: 0,
        lastLoginAt: demoUser.lastLoginAt,
        telegramUsername: null,
        rakebackClaimed: 0,
        signupBonus: 0,
        bonusWagered: 0,
        email: null,
        emailVerified: true,
        isDemo: true,
        demoCoin: demoUser.demoCoin,
      },
      token,
      isDemo: true,
      message: "Welcome to Demo Mode! You have $1,000,000 to play with. All bets are fictitious and will reset when you close this session.",
    });
  } catch (err) {
    console.error("Demo login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/demo/live-bets - Get fictitious live bets
demoRouter.get("/live-bets", async (req, res) => {
  try {
    const bets = generateFakeLiveBets(10);
    res.json({ bets, isDemo: true });
  } catch (err) {
    console.error("Demo live bets error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/demo/stats - Get demo stats
demoRouter.get("/stats", async (req, res) => {
  try {
    res.json({
      isDemo: true,
      message: "This is a demo account. All data is fictitious and will reset on session close.",
      features: {
        canBet: true,
        canWithdraw: false,
        canDeposit: false,
        bonusAvailable: false,
      },
      note: "Demo accounts cannot withdraw or deposit real funds.",
    });
  } catch (err) {
    console.error("Demo stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
