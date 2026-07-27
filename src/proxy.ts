import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function proxy(request: NextRequest) {
	const session = await auth.api.getSession({
		headers: await headers()
	});

	const isAuthRoute = request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/signup');
	
	// Paths that require authentication
	const isProtectedRoute = 
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
			return NextResponse.redirect(new URL("/dashboard", request.url));
		}
	}

	return NextResponse.next();
}

export const runtime = "nodejs";

export const config = {
	matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
