import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { env } from '@/env';

export const config = {
  matcher: ['/courses/:path*'],
};

export default withAuth(async (req) => {
  if (env.LOCAL_CMS_PROVIDER) return;

  const token = req.nextauth.token;
  if (!token) {
    return NextResponse.redirect(new URL('/invalidsession', req.url));
  }
  const user = await fetch(
    `${env.NEXT_PUBLIC_BASE_URL_LOCAL}/api/user?token=${token.jwtToken}`,
  );

  const json = await user.json();
  if (!json.user) {
    return NextResponse.redirect(new URL('/invalidsession', req.url));
  }
});
