# Casino Integration Setup Guide

## Quick Start

### 1. Database Setup (Neon.tech)

The migration has already been applied. Verify the schema:

```sql
-- Check casino_balance column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'casino_balance';

-- Check casino_transactions table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'casino_transactions';
```

### 2. Environment Variables (Render Dashboard)

Navigate to your `dgc-arcade-api` service settings and add:

```
CASINO_SECRET_SIGN=your_casino_secret_key
CASINO_PROVIDER_URL=https://your-casino-aggregator.com
CASINO_API_KEY=your_api_key_from_aggregator
CASINO_MERCHANT_ID=your_merchant_id
PLISIO_API_KEY=your_plisio_api_key
PLISIO_SECRET_KEY=your_plisio_secret_key
```

### 3. Plisio Webhook Configuration

1. Log in to https://plisio.net
2. Go to Settings → Webhooks
3. Add webhook URL: `https://your-api.render.com/api/payments/plisio-webhook`
4. Select events: "Transaction Completed"
5. Save and test

### 4. Frontend Deployment

The frontend components are already in place:
- `/artifacts/dgc-arcade/src/components/SlotLobby.tsx`
- `/artifacts/dgc-arcade/src/components/SlotGamePlayer.tsx`
- Updated bottom navigation with slots
- Updated navbar with slots link

Deploy with:
```bash
cd artifacts/dgc-arcade && pnpm run build && pnpm run serve
```

### 5. Backend Deployment

Deploy with:
```bash
cd artifacts/api-server && pnpm run build && node --enable-source-maps ./dist/index.mjs
```

## File Structure

```
dgc-arcade-v2/
├── lib/db/src/schema/
│   ├── casino-transactions.ts (NEW)
│   └── users.ts (UPDATED - added casinoBalance)
├── artifacts/api-server/src/
│   ├── routes/
│   │   ├── casino.ts (NEW)
│   │   └── index.ts (UPDATED - added casino routes)
│   └── lib/
│       └── platform-settings.ts (UPDATED - slotsEnabled: true)
├── artifacts/dgc-arcade/src/
│   ├── components/
│   │   ├── SlotLobby.tsx (NEW)
│   │   ├── SlotGamePlayer.tsx (NEW)
│   │   └── layout/bottom-nav.tsx (UPDATED - 5-column layout)
│   ├── pages/
│   │   └── slots.tsx (EXISTING - public access)
│   └── App.tsx (VERIFIED - slots routes configured)
├── render.yaml (UPDATED - casino env vars)
├── scripts/
│   ├── casino-migration.sql (NEW)
│   └── delete-old-slots.sql (NEW)
└── CASINO_INTEGRATION.md (NEW)
```

## API Endpoints Reference

### Game Launch
```
GET /api/slots/launch?game_id=sweet-bonanza
Authorization: Bearer {token}
Response: { success: true, launchUrl: "..." }
```

### Spin Callback
```
POST /api/slots/callback
Content-Type: application/json
{
  "action": "BET|WIN|REFUND",
  "user_id": 1,
  "amount": "10.00",
  "transaction_id": "unique_id",
  "game_id": "game_slug"
}
```

### Plisio Webhook
```
POST /api/payments/plisio-webhook
Content-Type: application/json
{
  "amount": "0.5",
  "currency": "BTC",
  "user_id": 1,
  "transaction_id": "plisio_tx_id",
  "status": "completed"
}
```

## Admin Controls

### Enable/Disable Slots

1. Go to Admin Panel → Settings
2. Toggle "Slots Enabled"
3. Changes apply immediately

### View Transactions

Query the casino_transactions table:
```sql
SELECT * FROM casino_transactions 
WHERE user_id = 1 
ORDER BY created_at DESC 
LIMIT 50;
```

### Check Player Balance

```sql
SELECT username, casino_balance 
FROM users 
WHERE id = 1;
```

## Testing Checklist

- [ ] Slots page loads without authentication
- [ ] Search and filter work on slot lobby
- [ ] Game launch generates valid iframe URL
- [ ] Spin callbacks update balance correctly
- [ ] Plisio webhook processes deposits
- [ ] Mobile navigation displays correctly
- [ ] Bottom nav items pop out on active
- [ ] Web header shows slots link
- [ ] Admin can toggle slotsEnabled
- [ ] Old slots are deleted from games table

## Troubleshooting

### Slots Page Shows 404

Check: `slotsEnabled` in platform settings (should be `true`)

### Balance Not Updating After Spin

Check: Webhook endpoint is receiving POST requests
Check: User ID in payload matches database user
Check: Row-level locking is working (no concurrent updates)

### Plisio Deposits Not Processing

Check: Webhook URL is correct in Plisio dashboard
Check: PLISIO_SECRET_KEY is set in environment
Check: Firewall allows Plisio IP addresses

### Game Won't Launch

Check: CASINO_API_KEY is valid
Check: CASINO_PROVIDER_URL is reachable
Check: User is authenticated (has valid token)

## Performance Optimization

1. **Caching**: Slot themes cached for 5 minutes
2. **Database**: Indexes on user_id and created_at in casino_transactions
3. **Frontend**: Lazy loading of slot components
4. **API**: Rate limiting on spin endpoint (120 req/min)

## Security Notes

- All balance updates use SELECT FOR UPDATE
- Casino callbacks require an HMAC-SHA256 `X-Casino-Signature` generated with `CASINO_SECRET_SIGN`; callbacks are rejected when the secret or signature is missing or invalid.
- CORS restricted on iframe
- Session tokens are single-use
- All queries parameterized (SQL injection prevention)

## Next Steps

1. Obtain casino aggregator credentials
2. Configure environment variables
3. Set up Plisio webhook
4. Deploy backend and frontend
5. Test with mock payloads
6. Monitor transaction logs
7. Enable slots in admin panel
