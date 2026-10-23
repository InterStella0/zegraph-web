import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const MAP_MANAGER_ROUTES = ['/admin/maps', '/admin/audit-logs'];

export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const steam = token?.steam as { is_superuser?: boolean; is_map_manager?: boolean } | undefined;
  const { pathname } = request.nextUrl;

  // Map managers who aren't superusers may only open the map and audit-log pages.
  const restricted = !steam?.is_superuser && steam?.is_map_manager;
  if (restricted && !MAP_MANAGER_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.redirect(new URL('/admin/maps', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
