import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

async function fetchSetupComplete(): Promise<boolean | null> {
  const base =
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:8080'

  try {
    const res = await fetch(`${base}/setup/status`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { setup_complete?: boolean }
    return data.setup_complete === true
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const setupComplete = await fetchSetupComplete()

  if (setupComplete === false) {
    if (pathname !== '/setup') {
      return NextResponse.redirect(new URL('/setup', request.url))
    }
    return NextResponse.next()
  }

  if (setupComplete === true && pathname === '/setup') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
