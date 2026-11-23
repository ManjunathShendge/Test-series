import { createConnection } from 'node:net';

const CHUNK_SIZE = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

export type ScanResult = 'clean' | 'infected';

export class ClamAvScanner {
  constructor(
    private readonly host: string | undefined,
    private readonly port: number | undefined,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  scan(bytes: Buffer): Promise<ScanResult> {
    const host = this.host;
    const port = this.port;
    if (!host || !port) {
      return Promise.reject(new Error('Antivirus scanner is not configured'));
    }

    return new Promise((resolve, reject) => {
      const socket = createConnection({ host, port });
      let response = Buffer.alloc(0);
      let settled = false;
      const timer = setTimeout(() => {
        socket.destroy();
        finish(new Error('Antivirus scan timed out'));
      }, this.timeoutMs);

      const finish = (error?: Error, result?: ScanResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error);
        else resolve(result!);
      };

      socket.on('error', (error) => finish(error));
      socket.on('close', () => {
        if (!settled) finish(new Error('Antivirus scanner closed without a result'));
      });
      socket.on('data', (chunk) => {
        response = Buffer.concat([response, chunk]);
        const terminator = response.indexOf(0);
        if (terminator < 0) return;
        const result = response.subarray(0, terminator).toString('utf8');
        if (/:\s*OK$/.test(result)) finish(undefined, 'clean');
        else if (/:\s*.+\sFOUND$/.test(result)) finish(undefined, 'infected');
        else finish(new Error('Antivirus scanner returned an invalid response'));
      });
      socket.on('connect', () => {
        socket.write(Buffer.from('zINSTREAM\0', 'ascii'));
        for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
          const chunk = bytes.subarray(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
          const length = Buffer.allocUnsafe(4);
          length.writeUInt32BE(chunk.length);
          socket.write(length);
          socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
    });
  }
}
