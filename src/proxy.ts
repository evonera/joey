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
		request.nextUrl.pathname.startsWith('/dashboard') ||
		request.nextUrl.pathname.startsWith('/drafts') ||
		request.nextUrl.pathname.startsWith('/posts') ||
		request.nextUrl.pathname.startsWith('/analytics') ||
		request.nextUrl.pathname.startsWith('/calendar') ||
		request.nextUrl.pathname.startsWith('/compose') ||
		request.nextUrl.pathname.startsWith('/agent') ||
		request.nextUrl.pathname.startsWith('/onboarding') ||
		request.nextUrl.pathname.startsWith('/accounts') ||
		request.nextUrl.pathname.startsWith('/settings') ||
		request.nextUrl.pathname.startsWith('/callback') ||
		request.nextUrl.pathname.startsWith('/brandkit') ||
		request.nextUrl.pathname.startsWith('/insights') ||
		request.nextUrl.pathname.startsWith('/assets');

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


export const config = {
	matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
