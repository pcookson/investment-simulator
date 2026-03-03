-- Migration 003: Add cancellation_reason to trades
--
-- Run in order in BOTH vesti-dev and vesti-prod SQL editors before
-- deploying the cron job code.
--
-- IF NOT EXISTS makes this safe to run a second time.

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS cancellation_reason text;
