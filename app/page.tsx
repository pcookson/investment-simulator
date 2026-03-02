import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// This page never renders content. It exists solely to redirect:
//   • Authenticated users   → /dashboard
//   • Unauthenticated users → /auth/signin
//
// The middleware also handles these redirects, but an explicit check here
// ensures correct behaviour even if the middleware matcher is ever narrowed.
export default async function RootPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/auth/signin");
  }
}
