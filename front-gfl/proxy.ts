import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const steam = token?.steam as { is_superuser?: boolean; is_map_manager?: boolean } | undefined;

  if (steam?.is_superuser) {
    return NextResponse.next();
  }

  if (steam?.is_map_manager) {
    const isMapsRoute = request.nextUrl.pathname === '/admin/maps' || request.nextUrl.pathname.startsWith('/admin/maps/');
    if (!isMapsRoute) {
      return NextResponse.redirect(new URL('/admin/maps', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
