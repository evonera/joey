import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export async function proxy(request: NextRequest) {
	let session = null;
	try {
		session = await auth.api.getSession({
			headers: request.headers
		});
	} catch (err) {
		console.error("[proxy] Session retrieval failed:", err);
		session = null;
	}

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
		request.nextUrl.pathname.startsWith('/assets') ||
		request.nextUrl.pathname.startsWith('/flows') ||
		request.nextUrl.pathname.startsWith('/engagement') ||
		request.nextUrl.pathname.startsWith('/notifications') ||
		request.nextUrl.pathname.startsWith('/theme-studio') ||
		request.nextUrl.pathname.startsWith('/operations');

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
