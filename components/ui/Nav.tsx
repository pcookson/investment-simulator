"use client";

// Nav — persistent navigation bar for all authenticated pages.
// Desktop: logo left, nav links with Trade dropdown, sign-out right.
// Mobile: hamburger left, centered logo, sign-out right; slide-down menu panel.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SignOutButton } from "./SignOutButton";

const NAV_LINKS = [
  { href: "/holdings", label: "Holdings" },
  { href: "/history", label: "History" },
  { href: "/leaderboard", label: "Leaderboard" },
] as const;

const TRADE_LINKS = [
  { href: "/trade", label: "Place order" },
  { href: "/trade/pending", label: "View pending orders" },
] as const;

const desktopLink =
  "inline-flex items-center border-b-2 px-4 py-4 text-sm font-medium transition-colors";
const desktopActive = "border-black text-black";
const desktopInactive =
  "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700";

export function Nav() {
  const pathname = usePathname();
  const isTradeActive = pathname.startsWith("/trade");
  const [mobileOpen, setMobileOpen] = useState(false);

  function close() {
    setMobileOpen(false);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">

      {/* ── Desktop row (md+) ─────────────────────────────────────────── */}
      <div className="mx-auto hidden max-w-6xl items-center justify-between px-4 py-0 sm:px-6 lg:px-8 md:flex">
        <div className="flex items-center">
          <Link
            href="/dashboard"
            className="mr-8 py-4 text-lg font-bold tracking-tight text-black"
          >
            Vesti
          </Link>

          <nav className="flex">
            {/* Dashboard */}
            <Link
              href="/dashboard"
              className={`${desktopLink} ${pathname === "/dashboard" ? desktopActive : desktopInactive}`}
            >
              Dashboard
            </Link>

            {/* Trade hover-dropdown */}
            <div className="group relative">
              <button
                className={`${desktopLink} ${isTradeActive ? desktopActive : desktopInactive} cursor-default`}
              >
                Trade
                <svg
                  className="ml-1 h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className="absolute left-0 top-full z-40 hidden pt-px group-hover:block">
                <div className="min-w-[180px] rounded-b-md border border-t-0 border-gray-200 bg-white shadow-md">
                  {TRADE_LINKS.map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      className={`block px-4 py-2.5 text-sm transition-colors first:pt-3 last:pb-3 ${
                        pathname === href
                          ? "font-medium text-black"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Remaining links */}
            {NAV_LINKS.map(({ href, label }) => {
              const isActive =
                pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={`${desktopLink} ${isActive ? desktopActive : desktopInactive}`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <SignOutButton className="text-sm text-gray-500 transition-colors hover:text-gray-800" />
      </div>

      {/* ── Mobile row (<md) ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 items-center px-4 py-3 md:hidden">
        {/* Left: hamburger */}
        <button
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="justify-self-start text-gray-600 hover:text-gray-900"
        >
          {mobileOpen ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>

        {/* Center: logo */}
        <Link
          href="/dashboard"
          onClick={close}
          className="justify-self-center text-lg font-bold tracking-tight text-black"
        >
          Vesti
        </Link>

        {/* Right: sign out */}
        <div className="justify-self-end">
          <SignOutButton className="text-sm text-gray-500 transition-colors hover:text-gray-800" />
        </div>
      </div>

      {/* ── Mobile menu panel ─────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="border-t border-gray-100 bg-white md:hidden">
          <nav className="flex flex-col gap-0.5 px-4 py-3">
            <Link
              href="/dashboard"
              onClick={close}
              className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                pathname === "/dashboard"
                  ? "bg-gray-100 text-black"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              Dashboard
            </Link>

            {/* Trade sub-section */}
            <p className="mt-3 mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Trade
            </p>
            {TRADE_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={close}
                className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  pathname === href
                    ? "bg-gray-100 text-black"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {label}
              </Link>
            ))}

            {/* Remaining links */}
            <div className="mt-3 border-t border-gray-100 pt-3 flex flex-col gap-0.5">
              {NAV_LINKS.map(({ href, label }) => {
                const isActive =
                  pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={close}
                    className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-gray-100 text-black"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
