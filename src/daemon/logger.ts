import { mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { TraceEvent } from '../shared/types';

const SESSION_DIR = join(homedir(), '.trace-viz', 'sessions');

export class SessionLogger {
  private sink?: ReturnType<ReturnType<typeof Bun.file>['writer']>;

  constructor(private readonly sessionId: string) {}

  async init(): Promise<void> {
    await mkdir(SESSION_DIR, { recursive: true });
    const path = join(SESSION_DIR, `${this.sessionId}.jsonl`);
    this.sink = Bun.file(path).writer();
  }

  write(event: TraceEvent): void {
    this.sink?.write(JSON.stringify(event) + '\n');
  }

  async close(): Promise<void> {
    await this.sink?.flush();
    this.sink?.end();
  }
}
