// app/holdings/page.tsx — Holdings page (stub)

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Nav } from "@/components/ui/Nav";

export const metadata = {
  title: "Holdings — Vesti",
};

export default async function HoldingsPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/signin");

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900">Holdings</h1>
        <p className="mt-2 text-sm text-gray-400">Coming soon.</p>
      </main>
    </div>
  );
}
