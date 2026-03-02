import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that require an authenticated session.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/trade",
  "/holdings",
  "/history",
  "/leaderboard",
];

// Auth pages that should redirect to /dashboard when the user is already signed in.
const AUTH_PREFIXES = ["/auth/signin", "/auth/signup"];

export async function middleware(request: NextRequest) {
  // Start with a plain "continue" response. The Supabase client may replace
  // this with a new response that carries updated auth cookies.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Propagate cookie updates into both the request (for downstream
          // middleware) and the response (so the browser receives them).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Use getUser() not getSession().
  // getUser() validates the token with Supabase's server — getSession() only
  // reads the cookie locally and can be spoofed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isAuthPage = AUTH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  // Unauthenticated user trying to access a protected route → sign-in page.
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/signin";
    return NextResponse.redirect(url);
  }

  // Authenticated user on a sign-in/sign-up page → dashboard.
  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run middleware on all routes EXCEPT:
     *   - _next/static  — compiled static assets
     *   - _next/image   — image optimisation endpoint
     *   - favicon.ico   — browser favicon request
     *   - static image files (svg, png, jpg, etc.)
     *
     * This mirrors the Supabase-recommended matcher so that auth cookie
     * refresh runs on every navigable page without slowing down static assets.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
