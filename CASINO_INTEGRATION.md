# Casino Integration Implementation Guide

## Overview

This document outlines the complete implementation of the premium slot casino section integrated into the DGC Arcade platform. The integration includes backend webhooks, database migrations, frontend components, and Plisio crypto payment processing.

## Architecture

### A. Database Layer (Neon.tech)

#### Schema Changes

**1. Users Table Enhancement**
- Added `casino_balance` column (DECIMAL(24, 12)) to track player slot credits
- Default value: 0.00

**2. Casino Transactions Table**
- New table: `casino_transactions`
- Columns:
  - `id` (UUID, Primary Key)
  - `user_id` (INTEGER, Foreign Key to users)
  - `transaction_id` (TEXT, Unique)
  - `type` (TEXT: BET, WIN, REFUND)
  - `amount` (DECIMAL(24, 12))
  - `created_at` (TIMESTAMPTZ)

#### Row-Level Locking

All balance updates use `SELECT FOR UPDATE` to prevent double-spending:

```typescript
const [user] = await tx.select().from(usersTable)
  .where(eq(usersTable.id, user_id))
  .for("update");
```

### B. Backend Implementation (Render)

#### Environment Variables

Add these to your Render dashboard:

```yaml
CASINO_SECRET_SIGN=<your_casino_secret>
CASINO_PROVIDER_URL=https://your.casino.aggregator.url
CASINO_API_KEY=<your_api_key>
CASINO_MERCHANT_ID=<your_merchant_id>
```

#### API Endpoints

**1. `/api/slots/launch?game_id=X` (GET)**
- Purpose: Generate secure game session link
- Authentication: Bearer token required
- Response: `{ success: true, launchUrl: "..." }`
- Behavior: Calls external aggregator API to get single-use session token

**2. `/api/slots/callback` (POST)**
- Purpose: Process spin results from casino aggregator
- Payload:
  ```json
  {
    "action": "BET|WIN|REFUND",
    "user_id": 123,
    "amount": "10.50",
    "transaction_id": "unique_id",
    "game_id": "game_slug"
  }
  ```
- Logic:
  - **BET**: Deduct amount from casino_balance (check sufficient funds)
  - **WIN**: Add amount to casino_balance
  - **REFUND**: Add amount back to casino_balance
- Returns: `{ success: true, message: "..." }`

**3. `/api/payments/plisio-webhook` (POST)**
- Purpose: Process Plisio crypto deposits
- Payload (from Plisio IPN):
  ```json
  {
    "amount": "0.5",
    "currency": "BTC",
    "user_id": 123,
    "transaction_id": "plisio_tx_id",
    "status": "completed"
  }
  ```
- Logic:
  - Verify IPN signature (TODO: implement signature verification)
  - Convert crypto amount to platform credits
  - Update user's casino_balance
  - Record transaction in casino_transactions table
- Returns: `{ success: true, message: "Deposit processed" }`

### C. Frontend Implementation

#### Public Access

- **Slots lobby** is accessible without login
- **Game launch** requires authentication
- **No email verification required** for slots (unlike race games)

#### Components

**1. SlotLobby.tsx**
- Displays grid of available slot games
- Features:
  - Real-time search across 348+ titles
  - Provider filter tabs (Pragmatic Play, Hacksaw Gaming, etc.)
  - Live jackpot ticker in header
  - Responsive grid (2 cols mobile, 3 cols tablet, 4 cols desktop)
  - Hover effects with game info overlay

**2. SlotGamePlayer.tsx**
- Full-screen game player component
- Features:
  - Secure iframe streaming
  - Fullscreen toggle
  - Mute/unmute audio
  - Back navigation
  - Mobile-responsive

#### Mobile Navigation (Bottom Nav)

Enhanced with 5-column layout:
1. **Home** - Standard glow effect
2. **Games** - Primary color pop-out
3. **Slots** - Amber/orange with maximum pop-out (centered, scale-125)
4. **Race** - Purple pop-out
5. **Profile** - Cyan/blue gradient with balance display

All active items use:
- Scale transformation (up to 125% for Slots)
- Vertical translation (-translate-y-2 to -translate-y-3)
- Glow shadow effects
- Bounce animation

#### Web Header

The navbar includes:
- Slots link in navigation (when `slotsEnabled` is true)
- Separate from Games section
- Consistent styling with other game sections

### D. Platform Settings

**New Setting: `slotsEnabled`**
- Type: Boolean
- Default: `true` (public by default)
- Controlled via Admin Panel
- When disabled, `/slots` route returns 404

### E. Plisio Integration

#### Setup Steps

1. Get Plisio API credentials from https://plisio.net
2. Add to environment variables:
   - `PLISIO_API_KEY`
   - `PLISIO_SECRET_KEY`
3. Configure webhook URL in Plisio dashboard:
   - `https://your-api.render.com/api/payments/plisio-webhook`
4. Whitelist Plisio IPs in firewall (if applicable)

#### Payment Flow

```
User Deposit (Crypto)
    ↓
Plisio Processes Payment
    ↓
Plisio Sends IPN to /api/payments/plisio-webhook
    ↓
Backend Verifies & Updates casino_balance
    ↓
Player Can Immediately Play Slots
```

### F. Revenue Model

**House Edge Distribution**
- Core games: 2-5% house edge (varies by game)
- Slots: ~3.5% house edge (standard)
- **GGR Split**: 85-90% to platform, 10-15% to aggregator

**Gross Gaming Revenue (GGR)**
- Total bets minus total wins
- Automatically calculated through transaction ledger
- Tracked in `casino_transactions` table

## Deployment Checklist

- [ ] Database migration applied to Neon.tech
- [ ] Environment variables configured in Render
- [ ] Casino aggregator credentials obtained
- [ ] Plisio webhook URL configured
- [ ] Frontend components deployed
- [ ] Mobile navigation tested on multiple devices
- [ ] Web header navigation verified
- [ ] Admin panel toggle for slotsEnabled tested
- [ ] Webhook endpoints tested with mock payloads
- [ ] Row-level locking verified (no double-spins)
- [ ] Transaction ledger audited

## Testing

### Mock Webhook Payloads

**Spin Bet:**
```bash
curl -X POST http://localhost:5000/api/slots/callback \
  -H "Content-Type: application/json" \
  -d '{
    "action": "BET",
    "user_id": 1,
    "amount": "10.00",
    "transaction_id": "spin_12345",
    "game_id": "sweet-bonanza"
  }'
```

**Spin Win:**
```bash
curl -X POST http://localhost:5000/api/slots/callback \
  -H "Content-Type: application/json" \
  -d '{
    "action": "WIN",
    "user_id": 1,
    "amount": "50.00",
    "transaction_id": "win_12345",
    "game_id": "sweet-bonanza"
  }'
```

**Plisio Deposit:**
```bash
curl -X POST http://localhost:5000/api/payments/plisio-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "0.5",
    "currency": "BTC",
    "user_id": 1,
    "transaction_id": "plisio_abc123",
    "status": "completed"
  }'
```

## Security Considerations

1. **Signature Verification**: Implement HMAC verification for Plisio webhooks
2. **Rate Limiting**: Spin endpoint limited to 120 requests/minute per IP
3. **SQL Injection**: All queries use parameterized statements (Drizzle ORM)
4. **CORS**: Slots iframe sandboxed with restricted permissions
5. **Session Tokens**: Single-use tokens for game launch (external aggregator)

## Monitoring & Alerts

- Monitor `/api/slots/callback` for failed transactions
- Alert on unusual betting patterns (fraud detection)
- Track GGR metrics daily
- Monitor Plisio webhook delivery failures
- Log all casino_transactions for audit trail

## Future Enhancements

1. **Live Leaderboard**: Real-time slot winners display
2. **Bonus Features**: Free spins, multiplier events
3. **VIP Tiers**: Exclusive slot games for high-rollers
4. **Analytics Dashboard**: Detailed GGR and player metrics
5. **Responsible Gambling**: Loss limits, session limits for slots
6. **Multi-Currency Support**: Direct crypto payouts (no conversion)

## Support & Troubleshooting

### Issue: Insufficient Funds Error

**Cause**: User casino_balance < bet amount
**Solution**: Ensure user has deposited crypto via Plisio

### Issue: Webhook Not Received

**Cause**: Firewall blocking or incorrect URL
**Solution**: Verify webhook URL in Plisio dashboard, check server logs

### Issue: Double-Spin Exploit

**Cause**: Race condition in balance update
**Solution**: Verify `SELECT FOR UPDATE` is being used in all transactions

## References

- [Plisio API Docs](https://plisio.net/api)
- [Casino Aggregator Docs](https://your.casino.aggregator.url/docs)
- [Neon.tech PostgreSQL](https://neon.tech/docs)
- [Render Deployment](https://render.com/docs)
