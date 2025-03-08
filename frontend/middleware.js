import { auth0 } from "./lib/auth0";
import { NextResponse } from "next/server";

export async function middleware(request) {
  const { pathname, origin, search } = request.nextUrl;
  
  // ✅ Allow homepage ("/") to load without authentication
  if (pathname === "/") {
    return NextResponse.next();
  }
  
  // ✅ Let Auth0 handle its own authentication routes
  if (pathname.startsWith("/auth")) {
    return await auth0.middleware(request);
  }
  
  // ✅ Define protected routes that require authentication
  const protectedRoutes = ["/dashboard", "/profile", "/meals"];
  
  // ✅ Enforce authentication only on protected routes
  if (protectedRoutes.some((route) => pathname.startsWith(route))) {
    const session = await auth0.getSession();
    if (!session) {
      // Redirect to login, but set returnTo to the current URL
      return NextResponse.redirect(`${origin}/auth/login?returnTo=${encodeURIComponent(pathname + search)}`);
    }
  }
  
  return NextResponse.next(); // ✅ Allow other routes to load normally
}

// ✅ Apply middleware only to relevant routes
export const config = {
  matcher: [
    "/auth/:path*",
    "/dashboard",
    "/profile",
    "/meals",
  ],
};