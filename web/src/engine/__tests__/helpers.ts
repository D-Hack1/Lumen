// Owner: Nived
// Test helper: serve public/ files to the loaders through a stubbed fetch.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const PUBLIC = join(__dirname, '..', '..', '..', 'public');

export function stubFetch(): void {
  globalThis.fetch = (async (url: string) => {
    try {
      const buf = await readFile(join(PUBLIC, url));
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      return { ok: true, status: 200, json: async () => JSON.parse(buf.toString()), arrayBuffer: async () => ab } as unknown as Response;
    } catch {
      return { ok: false, status: 404 } as unknown as Response;
    }
  }) as typeof fetch;
}

export async function readMock(rel: string): Promise<{ buf: ArrayBuffer; json: () => unknown }> {
  const b = await readFile(join(PUBLIC, 'data-mock', rel));
  return { buf: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, json: () => JSON.parse(b.toString()) };
}
