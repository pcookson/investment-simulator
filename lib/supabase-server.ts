import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// ---------------------------------------------------------------------------
// Server client — for use in Server Components and Server Actions
// ---------------------------------------------------------------------------
// Uses @supabase/ssr's createServerClient so auth sessions are read from and
// written to HTTP cookies via Next.js's cookies() API.
//
// ✅ Use this in:
//    • Server Components  (app/**/(page|layout).tsx without "use client")
//    • Server Actions     (functions marked with "use server")
//
// ❌ Do NOT use this in:
//    • Client Components ("use client") — use createBrowserSupabaseClient() instead
//    • Cron handlers / admin routes — use createServiceClient() instead
//
// Note: In Server Components, cookies() is read-only, so the setAll() call
// inside this function will silently no-op via the try/catch. Cookie writes
// only succeed in Route Handlers and Server Actions where the response can
// still be mutated. This is intentional — the middleware handles session
// refresh for Server Components.
// ---------------------------------------------------------------------------

/**
 * Create a Supabase client for Server Components and Server Actions.
 * Reads the authenticated user's session from request cookies.
 * Must be called inside an async server function — not at module level.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Silently ignored in Server Components where cookies are read-only.
            // The middleware is responsible for refreshing sessions in that case.
          }
        },
      },
    }
  );
}
