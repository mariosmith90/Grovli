import { auth0 } from "./lib/auth0";
import { NextResponse } from "next/server";

export async function middleware(request) {
  const { pathname, origin } = request.nextUrl;

  // ✅ Allow homepage ("/") to load without authentication
  if (pathname === "/") {
    return NextResponse.next();
  }

  // ✅ Let Auth0 handle its own authentication routes
  if (pathname.startsWith("/auth")) {
    return await auth0.middleware(request);
  }

  // ✅ Define protected routes that require authentication
  const protectedRoutes = ["/dashboard", "/profile", "/subscriptions", "/meals"];

  // ✅ Enforce authentication only on protected routes
  if (protectedRoutes.some((route) => pathname.startsWith(route))) {
    const session = await auth0.getSession();
    if (!session) {
      return NextResponse.redirect(`${origin}/auth/login`);
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
    "/subscriptions",     
    "/meals",             
  ],
};