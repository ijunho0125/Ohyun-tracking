import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCharacterApi } from '../server/character-api';

// Pause one catalog commit after its rename so the subscription can be opened
// at the exact point where the new selection is about to be published.
const renameGate = vi.hoisted(() => ({ next: null as null | ((release: () => void) => void) }));
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: (from: Parameters<typeof actual.rename>[0], to: Parameters<typeof actual.rename>[1]) => {
      const gate = renameGate.next;
      if (!gate) return actual.rename(from, to);
      renameGate.next = null;
      return new Promise<void>((resolve, reject) => {
        actual.rename(from, to).then(() => gate(resolve), reject);
      });
    },
  };
});

describe('character event subscription', () => {
  let directory: string, base: string, server: Server, api: ReturnType<typeof createCharacterApi>;
  let releaseCommit = () => {};
  const png = readFile(new URL('./fixtures/character.png', import.meta.url));

  async function save(id: string) {
    const image = new Blob([new Uint8Array(await png)], { type: 'image/png' });
    const form = new FormData();
    form.append('character', JSON.stringify({ id, name: id, flip: false, size: 1, footX: .5, footY: 1 }));
    form.append('original', image, 'original.png');
    form.append('processed', image, 'processed.png');
    return fetch(base + '/api/characters', { method: 'POST', body: form });
  }

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'motion-character-events-'));
    api = createCharacterApi(directory);
    server = createServer((request, response) => {
      if (request.url === '/api/characters/events') {
        const writeHead = response.writeHead.bind(response);
        response.writeHead = ((...args: Parameters<ServerResponse['writeHead']>) => {
          const result = writeHead(...args);
          releaseCommit();
          return result;
        }) as ServerResponse['writeHead'];
      }
      void api.handle(request, response);
    });
    await new Promise<void>(ready => server.listen(0, '127.0.0.1', ready));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server address');
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    releaseCommit();
    api.close();
    server.closeAllConnections();
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    await rm(directory, { recursive: true, force: true });
  });

  it('never sends an older selection after a concurrent update', async () => {
    expect((await save('first')).status).toBe(201);
    const renameReached = new Promise<void>(ready => {
      renameGate.next = release => { releaseCommit = release; ready(); };
    });
    const secondSave = save('second');
    await renameReached;

    const controller = new AbortController();
    try {
      const stream = await fetch(base + '/api/characters/events', { signal: controller.signal });
      const reader = stream.body!.getReader();
      let text = '';
      while ((text.match(/^data: /gm) ?? []).length < 2) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error('event stream ended early');
        text += new TextDecoder().decode(chunk.value);
      }
      const ids = text.split('\n').filter(line => line.startsWith('data: '))
        .map(line => JSON.parse(line.slice(6)).id);
      expect(ids).toEqual(['first', 'second']);
      expect((await secondSave).status).toBe(201);
    } finally {
      controller.abort();
    }
  });
});
