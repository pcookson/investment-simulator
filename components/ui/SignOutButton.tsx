"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface SignOutButtonProps {
  className?: string;
}

export function SignOutButton({ className }: SignOutButtonProps) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    // refresh() clears the Next.js server-component cache so the signed-out
    // state is reflected immediately without stale data showing briefly.
    router.push("/auth/signin");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className={
        className ??
        "text-sm text-gray-500 underline underline-offset-2 hover:text-gray-800 transition-colors"
      }
    >
      Sign out
    </button>
  );
}
