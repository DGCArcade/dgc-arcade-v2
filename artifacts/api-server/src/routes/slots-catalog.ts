import { Router } from "express";

export const slotsCatalogRouter = Router();

// Mock slot games data based on Cassanova open-source architecture
const SLOT_GAMES = [
  { id: 'gates-of-olympus', title: 'Gates of Olympus', provider: 'Pragmatic Play', thumbnail: 'https://images.pragmaticplay.net/game/vs20olympgate.png', rtp: 96.5, volatility: 'high', jackpot: 5000 },
  { id: 'sweet-bonanza', title: 'Sweet Bonanza', provider: 'Pragmatic Play', thumbnail: 'https://images.pragmaticplay.net/game/vs20sweetbonanza.png', rtp: 96.48, volatility: 'high', jackpot: 21100 },
  { id: 'wolf-gold', title: 'Wolf Gold', provider: 'Pragmatic Play', thumbnail: 'https://images.pragmaticplay.net/game/vs25wolfgold.png', rtp: 96.01, volatility: 'medium', jackpot: 2500 },
  { id: 'starburst', title: 'Starburst', provider: 'NetEnt', thumbnail: 'https://www.netent.com/en/wp-content/uploads/sites/2/2012/01/starburst_logo.png', rtp: 96.09, volatility: 'low', jackpot: 500 },
  { id: 'book-of-dead', title: 'Book of Dead', provider: 'Play\'n GO', thumbnail: 'https://static.playngo.com/games/book-of-dead-square.png', rtp: 96.21, volatility: 'high', jackpot: 5000 },
  { id: 'gonzo-quest', title: 'Gonzo\'s Quest', provider: 'NetEnt', thumbnail: 'https://www.netent.com/en/wp-content/uploads/sites/2/2011/11/gonzos-quest-logo.png', rtp: 95.97, volatility: 'high', jackpot: 2500 },
  { id: 'reactoonz', title: 'Reactoonz', provider: 'Play\'n GO', thumbnail: 'https://static.playngo.com/games/reactoonz-square.png', rtp: 96.51, volatility: 'high', jackpot: 4570 },
  { id: 'mega-moolah', title: 'Mega Moolah', provider: 'Microgaming', thumbnail: 'https://www.microgaming.co.uk/media/1001/mega-moolah.jpg', rtp: 88.12, volatility: 'high', jackpot: 12450000 },
  { id: 'dead-or-alive-2', title: 'Dead or Alive 2', provider: 'NetEnt', thumbnail: 'https://www.netent.com/en/wp-content/uploads/sites/2/2019/04/dead-or-alive-2-logo.png', rtp: 96.82, volatility: 'high', jackpot: 111111 },
  { id: 'big-bass-bonanza', title: 'Big Bass Bonanza', provider: 'Pragmatic Play', thumbnail: 'https://images.pragmaticplay.net/game/vs10bbbonanza.png', rtp: 96.71, volatility: 'medium', jackpot: 2100 },
  { id: 'sugar-rush', title: 'Sugar Rush', provider: 'Pragmatic Play', thumbnail: 'https://images.pragmaticplay.net/game/vs20sugarrush.png', rtp: 96.5, volatility: 'high', jackpot: 5000 },
  { id: 'wanted-dead-or-a-wild', title: 'Wanted Dead or a Wild', provider: 'Hacksaw Gaming', thumbnail: 'https://hacksawgaming.com/assets/games/wanted-dead-or-a-wild/wanted-dead-or-a-wild-thumbnail.jpg', rtp: 96.38, volatility: 'high', jackpot: 12500 },
];

slotsCatalogRouter.get("/catalog", (req, res) => {
  res.json(SLOT_GAMES);
});
