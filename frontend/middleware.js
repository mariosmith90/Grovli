import { auth0 } from "./lib/auth0";
import { NextResponse } from "next/server";

export async function middleware(request) {
  const { pathname, origin, search } = request.nextUrl;

  // Allow homepage ("/") to load without authentication
  if (pathname === "/") {
    return NextResponse.next();
  }

  // Let Auth0 handle its own authentication routes
  if (pathname.startsWith("/auth")) {
    return await auth0.middleware(request);
  }

  // Define protected routes that require authentication
  const protectedRoutes = ["/planner", "/profile", "/meals", "/saved-meals", "/onboarding"];

  // Enforce authentication only on protected routes
  if (protectedRoutes.some((route) => pathname.startsWith(route))) {
    const session = await auth0.getSession();
    
    if (!session) {
      // Redirect to login, but set returnTo to the current URL
      return NextResponse.redirect(`${origin}/auth/login?returnTo=${encodeURIComponent(pathname + search)}`);
    }

    // If user is authenticated but trying to access a route that needs onboarding first
    if (pathname !== "/onboarding" && !pathname.startsWith("/auth")) {
      // Skip onboarding check for onboarding page itself
      if (pathname !== "/onboarding") {
        // Instead of fetching, pass onboarding check to client-side
        // This prevents the fetch error in middleware
        const onboardingCheckUrl = new URL('/api/check-onboarding', origin);
        onboardingCheckUrl.searchParams.set('userId', session.user.sub);

        return NextResponse.redirect(onboardingCheckUrl);
      }
    }
  }

  return NextResponse.next(); // Allow other routes to load normally
}

// Apply middleware only to relevant routes
export const config = {
  matcher: [
    "/auth/:path*",
    "/onboarding",
    "/planner",
    "/profile",
    "/meals",
    "/saved-meals"
  ],
};