-- =============================================================================
-- 001_initial_schema.sql
-- Vesti — initial database schema
--
-- Run this file first, then run 002_rls_policies.sql.
-- Must be applied to BOTH vesti-dev and vesti-prod.
--
-- Table creation order:
--   1. Enums
--   2. Trigger function (shared utility)
--   3. portfolios
--   4. holdings
--   5. trades
--   6. daily_snapshots
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

CREATE TYPE trade_type AS ENUM ('buy', 'sell');

CREATE TYPE trade_status AS ENUM ('pending', 'executed', 'cancelled');


-- -----------------------------------------------------------------------------
-- Trigger function — keeps updated_at current on every UPDATE
-- Shared by any table that has an updated_at column.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- -----------------------------------------------------------------------------
-- portfolios
--
-- One row per user. Created on sign-up with cash_balance = 100000.00.
-- sp500_baseline_price stores the SPY closing price on the day the user
-- joined, enabling a personal S&P benchmark for each user.
-- -----------------------------------------------------------------------------

CREATE TABLE portfolios (
  id                   uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cash_balance         numeric(15, 2) NOT NULL DEFAULT 100000.00,
  sp500_baseline_price numeric(15, 4) NOT NULL,
  created_at           timestamptz    NOT NULL DEFAULT NOW(),

  -- Enforce exactly one portfolio per user
  CONSTRAINT portfolios_user_id_key UNIQUE (user_id),
  -- Cash balance can reach zero but never go negative
  CONSTRAINT portfolios_cash_balance_non_negative CHECK (cash_balance >= 0)
);

CREATE INDEX idx_portfolios_user_id ON portfolios (user_id);

COMMENT ON TABLE portfolios IS
  'One row per user. Tracks virtual cash balance and personal S&P 500 baseline.';
COMMENT ON COLUMN portfolios.sp500_baseline_price IS
  'SPY closing price on the day the user signed up. Used to calculate the personal S&P benchmark: 100000 × (current_SPY / sp500_baseline_price).';


-- -----------------------------------------------------------------------------
-- holdings
--
-- One row per (user, ticker) pair — upserted by the cron job after each
-- executed buy. Rows are deleted when shares reach zero after a full sell.
-- -----------------------------------------------------------------------------

CREATE TABLE holdings (
  id                 uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker             text           NOT NULL,
  shares             numeric(18, 8) NOT NULL,
  average_cost_basis numeric(15, 4) NOT NULL,
  updated_at         timestamptz    NOT NULL DEFAULT NOW(),

  -- Only one holding row per user per ticker
  CONSTRAINT holdings_user_ticker_key UNIQUE (user_id, ticker),
  CONSTRAINT holdings_shares_positive CHECK (shares > 0),
  CONSTRAINT holdings_cost_basis_positive CHECK (average_cost_basis > 0),
  -- Tickers are stored in upper case (enforced at the application layer,
  -- but the check here prevents accidental lower-case inserts)
  CONSTRAINT holdings_ticker_uppercase CHECK (ticker = upper(ticker))
);

CREATE INDEX idx_holdings_user_id ON holdings (user_id);
CREATE INDEX idx_holdings_ticker   ON holdings (ticker);

CREATE TRIGGER holdings_set_updated_at
  BEFORE UPDATE ON holdings
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE holdings IS
  'Current open positions. One row per (user, ticker). Managed exclusively by the cron job.';
COMMENT ON COLUMN holdings.average_cost_basis IS
  'Weighted average price paid per share across all executed buys for this ticker.';


-- -----------------------------------------------------------------------------
-- trades
--
-- Every buy or sell order submitted by a user. Status starts as "pending"
-- and is set to "executed" (or "cancelled") by the cron job or user action.
-- executed_price is null until the cron fills the order at market close.
-- -----------------------------------------------------------------------------

CREATE TABLE trades (
  id             uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker         text           NOT NULL,
  trade_type     trade_type     NOT NULL,
  shares         numeric(18, 8) NOT NULL,
  executed_price numeric(15, 4),           -- null until filled by cron
  status         trade_status   NOT NULL DEFAULT 'pending',
  submitted_at   timestamptz    NOT NULL DEFAULT NOW(),
  executed_at    timestamptz,              -- null until filled by cron

  CONSTRAINT trades_shares_positive CHECK (shares > 0),
  CONSTRAINT trades_executed_price_positive
    CHECK (executed_price IS NULL OR executed_price > 0),
  -- executed_at and executed_price must both be set or both be null
  CONSTRAINT trades_execution_fields_consistent
    CHECK (
      (executed_price IS NULL AND executed_at IS NULL) OR
      (executed_price IS NOT NULL AND executed_at IS NOT NULL)
    ),
  CONSTRAINT trades_ticker_uppercase CHECK (ticker = upper(ticker))
);

-- Covering index for the most common query pattern: "all pending trades for
-- a given user". The cron job also queries all pending trades across all users.
CREATE INDEX idx_trades_user_id        ON trades (user_id);
CREATE INDEX idx_trades_ticker         ON trades (ticker);
CREATE INDEX idx_trades_status         ON trades (status) WHERE status = 'pending';
CREATE INDEX idx_trades_user_status    ON trades (user_id, status);

COMMENT ON TABLE trades IS
  'All buy/sell orders. Pending orders are filled by the daily cron job at market close.';
COMMENT ON COLUMN trades.executed_price IS
  'The actual closing price at which the order was filled. Null while pending.';
COMMENT ON COLUMN trades.submitted_at IS
  'Used to determine which trading day an order belongs to (cutoff: 3:30pm ET).';


-- -----------------------------------------------------------------------------
-- daily_snapshots
--
-- Written once per trading day per user by the cron job after market close.
-- Powers the performance chart on the dashboard. Both values start at
-- 100,000.00 on the user''s first trading day.
-- -----------------------------------------------------------------------------

CREATE TABLE daily_snapshots (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            date           NOT NULL,
  portfolio_value numeric(15, 2) NOT NULL,
  sp500_value     numeric(15, 2) NOT NULL,
  created_at      timestamptz    NOT NULL DEFAULT NOW(),

  -- Only one snapshot per user per trading day
  CONSTRAINT daily_snapshots_user_date_key UNIQUE (user_id, date)
);

CREATE INDEX idx_daily_snapshots_user_id   ON daily_snapshots (user_id);
-- Ordering by date is the primary access pattern for the chart query
CREATE INDEX idx_daily_snapshots_user_date ON daily_snapshots (user_id, date);

COMMENT ON TABLE daily_snapshots IS
  'End-of-day portfolio and S&P benchmark values. Written by cron. Powers the performance chart.';
COMMENT ON COLUMN daily_snapshots.sp500_value IS
  'What $100,000 would be worth in SPY on this date given the user''s personal baseline: 100000 × (spy_close / sp500_baseline_price).';
