import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Browser client — for use in Client Components ("use client")
// ---------------------------------------------------------------------------
// Uses @supabase/ssr's createBrowserClient so that auth sessions are stored
// in cookies and stay in sync with Server Components automatically.
// Safe to call at module level or inside a component — it returns a singleton.
// ---------------------------------------------------------------------------

/**
 * Create a Supabase client for use in Client Components.
 * Call this inside your component or a custom hook — never import a shared
 * singleton, because each call returns a memoised instance automatically.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ---------------------------------------------------------------------------
// ⚠️  SERVICE ROLE CLIENT — SERVER-SIDE ONLY ⚠️
// ---------------------------------------------------------------------------
// This client is initialised with SUPABASE_SERVICE_ROLE_KEY, which grants
// unrestricted database access and BYPASSES Row Level Security entirely.
//
// ✅ Safe to use in:
//    • /app/api/**  route handlers (Route Handlers)
//    • /api/cron/** cron job endpoint
//
// ❌ NEVER import this function in:
//    • Any file with "use client" at the top
//    • Client Components (anything rendered in the browser)
//    • Shared utility files that may be imported by client code
//
// If you accidentally expose this key to the browser, rotate it immediately
// in the Supabase dashboard: Settings → API → Service role key → Regenerate.
// ---------------------------------------------------------------------------

/**
 * Create a Supabase admin client using the service role key.
 * Bypasses Row Level Security. Use ONLY in trusted server-side code.
 */
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "Missing environment variable: SUPABASE_SERVICE_ROLE_KEY. " +
        "This variable must only be set in server-side environments."
    );
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        // Disable all browser-oriented auth features — this client is
        // meant for machine-to-machine server calls only.
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  );
}
