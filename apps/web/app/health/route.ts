import { NextResponse } from 'next/server';

// Liveness for the web tier. Deliberately dependency free and never cached:
// a cached health response would report a dead instance as healthy.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) });
}
