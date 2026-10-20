/* VEXCollab - compile the current editor snapshot. AGPL-3.0-only. */
import { NextResponse } from 'next/server';
import { CompileError, compilePython, MAX_SOURCE_BYTES } from '@/lib/vex/compiler';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    // Bound the incoming stream before parsing JSON, including chunked requests.
    const reader = request.body?.getReader();
    if (!reader) throw new CompileError('Send Python source to compile.', 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_SOURCE_BYTES * 2) {
          await reader.cancel();
          throw new CompileError('The compile request is too large.', 413);
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let source: unknown;
    try { ({ source } = JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch { throw new CompileError('Send a JSON object containing Python source.', 400); }
    if (typeof source !== 'string') throw new CompileError('Python source must be text.', 400);
    const bytes = await compilePython(source);
    return NextResponse.json({ bytecode: Buffer.from(bytes).toString('base64'),
      bytes: bytes.byteLength, compiler: 'MicroPython 1.13', format: 'mpy' },
    { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CompileError ? error.message : 'The compiler could not finish. Try again.' },
      { status: error instanceof CompileError ? error.status : 500 });
  }
}
