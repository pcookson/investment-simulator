"use client";

// Nav — persistent navigation bar for all authenticated pages.
// Client component so usePathname can highlight the active link.
// "Trade" renders as a hover dropdown with Place order / View pending orders.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./SignOutButton";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/holdings", label: "Holdings" },
  { href: "/history", label: "History" },
  { href: "/leaderboard", label: "Leaderboard" },
] as const;

const TRADE_LINKS = [
  { href: "/trade", label: "Place order" },
  { href: "/trade/pending", label: "View pending orders" },
] as const;

const linkBase =
  "inline-flex items-center border-b-2 px-4 py-4 text-sm font-medium transition-colors";
const linkActive = "border-black text-black";
const linkInactive =
  "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700";

export function Nav() {
  const pathname = usePathname();
  const isTradeActive = pathname.startsWith("/trade");

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-0 sm:px-6 lg:px-8">
        {/* Logo + links */}
        <div className="flex items-center">
          <Link
            href="/dashboard"
            className="mr-8 py-4 text-lg font-bold tracking-tight text-black"
          >
            Vesti
          </Link>
          <nav className="hidden md:flex">
            {/* Dashboard */}
            <Link
              href="/dashboard"
              className={`${linkBase} ${pathname === "/dashboard" ? linkActive : linkInactive}`}
            >
              Dashboard
            </Link>

            {/* Trade — hover dropdown */}
            <div className="group relative">
              <button
                className={`${linkBase} ${isTradeActive ? linkActive : linkInactive} cursor-default`}
              >
                Trade
                <svg
                  className="ml-1 h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Dropdown panel */}
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
                  className={`${linkBase} ${isActive ? linkActive : linkInactive}`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sign out */}
        <SignOutButton className="text-sm text-gray-500 transition-colors hover:text-gray-800" />
      </div>
    </header>
  );
}
