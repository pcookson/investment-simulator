// app/trade/pending/page.tsx — Pending orders list (Server Component)

import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PendingOrdersList } from "./PendingOrdersList";

export const metadata = {
  title: "Pending Orders — Vesti",
};

export interface PendingTrade {
  id: string;
  ticker: string;
  trade_type: "buy" | "sell";
  shares: number;
  submitted_at: string; // ISO string
}

export default async function PendingOrdersPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/signin");

  const { data } = await supabase
    .from("trades")
    .select("id, ticker, trade_type, shares, submitted_at")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("submitted_at", { ascending: false });

  const pending: PendingTrade[] = data ?? [];

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-black">Pending Orders</h1>
          <Link
            href="/trade"
            className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-800 transition-colors"
          >
            Place an order
          </Link>
        </div>

        {pending.length === 0 ? (
          <div className="rounded-lg border border-gray-200 px-6 py-12 text-center">
            <p className="text-gray-500 text-sm">No pending orders.</p>
            <Link
              href="/trade"
              className="mt-4 inline-block text-sm font-semibold text-black underline underline-offset-2 hover:text-gray-700 transition-colors"
            >
              Place your first order
            </Link>
          </div>
        ) : (
          <PendingOrdersList trades={pending} />
        )}
      </div>
    </main>
  );
}
