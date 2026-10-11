import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Tiny shared "database": stores each collection as a JSON file in ./.data
 * on the machine running `npm run dev`. Every device that opens the app
 * (laptop, phone, tunnel URL) talks to this same server, so they all see
 * the same accounts, admins and uploaded documents.
 */

export const dynamic = 'force-dynamic';

const ALLOWED_KEYS = new Set([
  'data_vault_accounts',
  'data_vault_admins',
  'data_vault_documents',
]);

const DATA_DIR = path.join(process.cwd(), '.data');

function fileFor(key: string) {
  return path.join(DATA_DIR, `${key}.json`);
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') ?? '';
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: 'Unknown key' }, { status: 400 });
  }
  try {
    const raw = await fs.readFile(fileFor(key), 'utf8');
    return new NextResponse(raw, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    // Nothing saved yet
    return NextResponse.json(null, { headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function PUT(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') ?? '';
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: 'Unknown key' }, { status: 400 });
  }
  try {
    const body = await req.text();
    JSON.parse(body); // make sure it's valid JSON before saving
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = fileFor(key) + '.tmp';
    await fs.writeFile(tmp, body, 'utf8');
    await fs.rename(tmp, fileFor(key));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  }
}
