-- Migration for Casino Integration

-- 1. Add casino_balance to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS casino_balance DECIMAL(24, 12) DEFAULT 0.00;

-- 2. Create casino_transactions ledger table
CREATE TABLE IF NOT EXISTS casino_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id),
    transaction_id TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL, -- 'BET', 'WIN', 'REFUND'
    amount DECIMAL(24, 12) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create index for performance
CREATE INDEX IF NOT EXISTS idx_casino_transactions_user_id ON casino_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_casino_transactions_created_at ON casino_transactions(created_at DESC);
