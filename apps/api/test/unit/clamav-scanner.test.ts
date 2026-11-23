import { createServer, type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ClamAvScanner } from '../../src/providers/antivirus/clamav-scanner.js';

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

async function scannerFor(reply: string, onBytes?: (size: number) => void) {
  const server = createServer((socket) => {
    let pending = Buffer.alloc(0);
    let cursor = 0;
    let bodySize = 0;
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      if (cursor === 0) {
        const command = Buffer.from('zINSTREAM\0', 'ascii');
        if (pending.length < command.length) return;
        if (!pending.subarray(0, command.length).equals(command)) {
          socket.destroy(new Error('Invalid scanner command'));
          return;
        }
        cursor = command.length;
      }
      while (pending.length >= cursor + 4) {
        const size = pending.readUInt32BE(cursor);
        if (pending.length < cursor + 4 + size) return;
        cursor += 4 + size;
        if (size === 0) {
          onBytes?.(bodySize);
          socket.end(`${reply}\0`);
          return;
        }
        bodySize += size;
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return new ClamAvScanner('127.0.0.1', address.port);
}

describe('ClamAvScanner', () => {
  it('streams file chunks and accepts only a clean response', async () => {
    let received = 0;
    const scanner = await scannerFor('stream: OK', (size) => (received = size));
    const bytes = Buffer.alloc(70 * 1024, 7);
    await expect(scanner.scan(bytes)).resolves.toBe('clean');
    expect(received).toBe(bytes.length);
  });

  it('reports infected files distinctly', async () => {
    const scanner = await scannerFor('stream: Eicar-Test-Signature FOUND');
    await expect(scanner.scan(Buffer.from('test'))).resolves.toBe('infected');
  });

  it('fails closed when no scanner is configured', async () => {
    await expect(new ClamAvScanner(undefined, undefined).scan(Buffer.from('test'))).rejects.toThrow(
      'not configured',
    );
  });
});
