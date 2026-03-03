"use client";

// Nav — persistent navigation bar for all authenticated pages.
// Client component so usePathname can highlight the active link.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./SignOutButton";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/trade", label: "Trade" },
  { href: "/holdings", label: "Holdings" },
  { href: "/history", label: "History" },
  { href: "/leaderboard", label: "Leaderboard" },
] as const;

export function Nav() {
  const pathname = usePathname();

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
            {NAV_LINKS.map(({ href, label }) => {
              const isActive =
                pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={`inline-flex items-center border-b-2 px-4 py-4 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-black text-black"
                      : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                  }`}
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
