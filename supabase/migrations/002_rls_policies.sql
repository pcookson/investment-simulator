-- =============================================================================
-- 002_rls_policies.sql
-- Vesti — Row Level Security policies
--
-- Run this file AFTER 001_initial_schema.sql.
-- Must be applied to BOTH vesti-dev and vesti-prod.
--
-- RLS strategy:
--   Every table is locked down so authenticated users can only touch their
--   own rows (where auth.uid() = user_id).
--
--   The service role key used by the cron job bypasses RLS entirely at the
--   Postgres level — no special policy is needed for cron operations.
--
--   Access by table:
--     portfolios      — authenticated users: SELECT only
--                       (INSERT on signup, UPDATE on trade execution: service role via cron)
--     holdings        — authenticated users: SELECT only
--                       (all writes managed exclusively by cron via service role)
--     trades          — authenticated users: SELECT, INSERT, UPDATE
--                       SELECT: view own trade history and pending orders
--                       INSERT: submit a new buy or sell order
--                       UPDATE: cancel a pending order (status → 'cancelled')
--                       NOTE: RLS controls row access only. Application logic
--                       is responsible for ensuring UPDATE only changes status
--                       to 'cancelled' on rows where status = 'pending'.
--     daily_snapshots — authenticated users: SELECT only
--                       (all writes managed exclusively by cron via service role)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- portfolios
-- -----------------------------------------------------------------------------

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolios: users can read their own row"
  ON portfolios
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- holdings
-- -----------------------------------------------------------------------------

ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holdings: users can read their own rows"
  ON holdings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- trades
-- -----------------------------------------------------------------------------

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trades: users can read their own rows"
  ON trades
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "trades: users can insert their own rows"
  ON trades
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending trades (to cancel them).
-- USING restricts which rows can be targeted.
-- WITH CHECK ensures user_id cannot be changed to another user's id.
-- Business logic (cancellation only, only on pending) is enforced in the
-- application layer, not here.
CREATE POLICY "trades: users can update their own rows"
  ON trades
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- daily_snapshots
-- -----------------------------------------------------------------------------

ALTER TABLE daily_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_snapshots: users can read their own rows"
  ON daily_snapshots
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
