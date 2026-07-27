import { betterFetch } from "@better-fetch/fetch";
import type { Session } from "better-auth/types";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
	const { data: session } = await betterFetch<Session>(
		"/api/auth/get-session",
		{
			baseURL: request.nextUrl.origin,
			headers: {
				cookie: request.headers.get("cookie") || "",
			},
		},
	);

	const isAuthRoute = request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/signup');
	
	// Paths that require authentication
	const isProtectedRoute = 
		request.nextUrl.pathname === '/' || 
		request.nextUrl.pathname.startsWith('/onboarding') ||
		request.nextUrl.pathname.startsWith('/accounts') ||
		request.nextUrl.pathname.startsWith('/settings') ||
		request.nextUrl.pathname.startsWith('/callback');

	if (!session) {
		if (isProtectedRoute) {
			return NextResponse.redirect(new URL("/login", request.url));
		}
	} else {
		if (isAuthRoute || request.nextUrl.pathname === '/') {
			return NextResponse.redirect(new URL("/onboarding", request.url));
		}
	}

	return NextResponse.next();
}

export const config = {
	matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
