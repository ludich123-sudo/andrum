import { NextResponse } from 'next/server';
import { tick } from '@/lib/cron';
import { getConfig } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function run(req: Request) {
  const secret = await getConfig('cron_secret');
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await tick();
  return NextResponse.json({ ok: true, ...result });
}

export const POST = run;
export const GET = run;
