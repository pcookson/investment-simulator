Vesti — Agent Instructions
Project Overview
App Name: Vesti
A mock stock trading platform where users receive $100,000 in virtual cash and compete to beat the S&P 500. Designed as a portfolio project with clean, professional aesthetics. The core mechanic: every dollar above what the S&P 500 would have returned on the user's $100k is one point. Users are ranked on a leaderboard by this score.
This is intentionally scoped as a "realistic regular investor" experience — not a day trading simulator. Trades are few, thoughtful, and execute at end-of-day prices. Think of it as the responsible alternative to gambling.

Tech Stack
LayerChoiceNotesFrameworkNext.js (App Router)Deployed on Vercel, zero-configStylingTailwind CSSUtility-first, fast to buildDatabaseSupabase (Postgres)Free tier, handles auth + DBAuthSupabase AuthEmail/password + optional Google OAuthMarket DataAlpha Vantage or FinnhubFree tier, end-of-day prices onlyChartsRechartsDual-line time series for portfolio vs S&PCron JobVercel CronRuns once daily ~5pm ET after market close

Database Schema
users (managed by Supabase Auth)

id — uuid, primary key
email — string
display_name — string
created_at — timestamp

portfolios

id — uuid, primary key
user_id — uuid, FK to users
cash_balance — decimal, starts at 100000.00
sp500_baseline_price — decimal — SPY closing price on the day user signed up
created_at — timestamp


The S&P benchmark value at any time is calculated as:
100000 × (current_SPY_price / sp500_baseline_price)
This makes every user's S&P comparison personal to their start date.

holdings

id — uuid, primary key
user_id — uuid, FK to users
ticker — string (e.g. "AAPL", "VOO")
shares — decimal
average_cost_basis — decimal — average price paid per share
updated_at — timestamp

trades

id — uuid, primary key
user_id — uuid, FK to users
ticker — string
trade_type — enum: buy | sell
shares — decimal
executed_price — decimal — filled in by cron at market close, null if pending
status — enum: pending | executed | cancelled
submitted_at — timestamp
executed_at — timestamp, nullable

daily_snapshots

id — uuid, primary key
user_id — uuid, FK to users
date — date (trading days only, no weekends/holidays)
portfolio_value — decimal — cash + value of all holdings at close
sp500_value — decimal — what $100k would be worth in SPY on this date
created_at — timestamp


Both values start at 100,000.00 on the user's first trading day.
This table powers the performance chart.


Core Business Logic
On User Sign Up

Create a portfolio row with cash_balance = 100000.00
Fetch the current SPY closing price (or last available close)
Store it as sp500_baseline_price
Write the first daily_snapshots row with both values at 100000.00

Trade Submission Rules

Users can submit buy/sell orders any time
Orders submitted before 3:30pm ET on a trading day execute that day
Orders submitted after 3:30pm ET execute the next trading day
Status is pending until the cron job runs
On a buy: validate user has sufficient cash balance before accepting the order
On a sell: validate user holds sufficient shares before accepting the order
No shorting, no options — V1 is long stock and ETF positions only

Daily Cron Job (~5:00pm ET, weekdays)
Runs in this order:

Fetch closing prices for SPY + every ticker with a pending order or active holding
Process all pending orders with status = pending and submitted_at before the cutoff:

Set executed_price to closing price
Set status = executed, executed_at = now()
For buys: deduct shares × executed_price from cash_balance, upsert holdings
For sells: add shares × executed_price to cash_balance, reduce holdings (delete row if shares reach 0)
Recalculate average_cost_basis on buys using weighted average


For every user, calculate total portfolio value: cash_balance + sum(shares × closing_price) for all holdings
Fetch current SPY price, calculate each user's S&P benchmark value
Write a daily_snapshots row for each user
Skip weekends and market holidays (maintain a list or use a market calendar API)

Leaderboard Score
score = total_portfolio_value - sp500_benchmark_value
Positive = beating the market. Negative = underperforming. Displayed in dollars.

Feature Scope — V1

 Auth — sign up, log in, log out (Supabase Auth)
 Dashboard — performance chart (portfolio in black, S&P in green), portfolio value, S&P value, score
 Holdings — table of current positions with ticker, shares, avg cost, current value, gain/loss
 Trade form — search ticker, enter shares, see estimated cost, submit order (queued as pending)
 Pending orders — view and cancel orders not yet executed
 Trade history — log of all executed trades
 Leaderboard — all users ranked by score vs S&P

Future Scope — V2+

Options trading
Short selling
Limit orders (currently all orders are market orders executed at close)
Intraday price display (if upgrading to a paid API tier)
User profiles and avatars
Portfolio allocation pie chart
More robust deployment (e.g. Railway, Render) if scaling beyond free tier


Chart Spec

Library: Recharts
Type: LineChart with two series
X-axis: trading days since user joined (date formatted)
Y-axis: dollar value starting at $100,000
Series 1: portfolio_value — color #000000 (black)
Series 2: sp500_value — color #00e676 (green)
Both lines start at the same point (100,000) on day one
Tooltip should show both values and the score differential on hover


Project Structure (suggested)
/app
  /dashboard        — main portfolio view + chart
  /trade            — trade submission form
  /holdings         — current positions
  /history          — trade history
  /leaderboard      — rankings
  /auth             — sign in / sign up
/components
  /ui               — reusable components
  /charts           — Recharts wrappers
/lib
  /supabase.ts      — Supabase client
  /market.ts        — Alpha Vantage / Finnhub API calls
  /trading.ts       — trade logic helpers
  /calculations.ts  — portfolio value, score, benchmark calculations
/api
  /cron             — daily cron job handler

Supabase Environment Strategy

Two separate Supabase projects must be created: vesti-dev and vesti-prod
Local development (localhost) points at vesti-dev
Vercel production deployment points at vesti-prod
.env.local uses vesti-dev credentials
Vercel environment variables in the dashboard use vesti-prod credentials
This ensures test trades and dummy users never appear in the real leaderboard
Both projects must have identical schema — migrations are written once and applied to both

Environment Variables Needed
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY         # for cron job (server-side only, NEVER expose to client)
MARKET_DATA_API_KEY             # Alpha Vantage or Finnhub
CRON_SECRET                     # to secure the cron endpoint

Epics & Stories — V1
Epic 1: Project Setup & Infrastructure

Story 1.1 — Initialize Next.js project with Tailwind CSS, folder structure as per agents.md
Story 1.2 — Set up Supabase project, configure environment variables, initialize Supabase client in codebase
Story 1.3 — Create all database tables in Supabase (users, portfolios, holdings, trades, daily_snapshots)
Story 1.4 — Set up Vercel project, connect to GitHub repo, confirm deployment pipeline works

Epic 2: Authentication

Story 2.1 — Sign up page — email and display name, creates user and portfolio row, snapshots SPY baseline price
Story 2.2 — Sign in page — email/password login with redirect to dashboard
Story 2.3 — Sign out and protected routes — unauthenticated users redirected to sign in

Epic 3: Market Data Service

Story 3.1 — Set up Alpha Vantage or Finnhub API integration, create a market.ts helper that fetches end-of-day closing price for any ticker
Story 3.2 — Add SPY price fetching specifically, used for baseline and benchmark calculations
Story 3.3 — Add ticker search/validation so users can't submit trades for non-existent tickers

Epic 4: Trading

Story 4.1 — Trade submission form — search ticker, enter shares, see estimated value, submit buy or sell order
Story 4.2 — Server-side trade validation — sufficient cash for buys, sufficient shares for sells, cutoff time logic
Story 4.3 — Pending orders view — list of unexecuted trades with ability to cancel

Epic 5: Daily Cron Job

Story 5.1 — Build and secure the cron endpoint in /api/cron
Story 5.2 — Fetch closing prices for all active tickers and SPY, execute all pending orders, update cash balances and holdings
Story 5.3 — Write daily_snapshots row for every user after execution
Story 5.4 — Configure Vercel Cron to trigger the job at 5pm ET on weekdays

Epic 6: Dashboard

Story 6.1 — Portfolio summary header — current portfolio value, S&P benchmark value, score differential
Story 6.2 — Performance chart — dual line chart (black = portfolio, green = S&P) from daily_snapshots data
Story 6.3 — Holdings table — ticker, shares, avg cost, current value, gain/loss per position

Epic 7: History & Leaderboard

Story 7.1 — Trade history page — full log of executed trades sorted by date
Story 7.2 — Leaderboard page — all users ranked by score, showing portfolio value, S&P value, and differential

Epic 8: UI Polish

Story 8.1 — Consistent layout, navigation, and responsive design across all pages
Story 8.2 — Empty states, loading states, and error handling across the app
Story 8.3 — "Orders execute at market close" messaging and other UX copy that sets expectations correctly


Key Constraints & Reminders

Market data is end-of-day only — do not attempt real-time price display
All trade execution happens in the cron job only — never execute trades in a user-facing API route
The S&P comparison is personal to each user's start date — never compare absolute values across users, always use the score differential
Keep V1 scope tight — no shorting, no options, no margin
The platform should feel like a serious financial product, not a game, even though it uses mock money