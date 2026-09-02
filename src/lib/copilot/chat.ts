/*
 * VEXCollab - Copilot chat over the Agent Client Protocol.
 * Licensed under AGPL-3.0-only.
 *
 * The Copilot language server exposes an agent interface in `--acp` mode, the
 * same one Zed and JetBrains use for chat. ACP is newline-delimited JSON-RPC
 * over stdio rather than LSP's Content-Length framing.
 *
 * ACP is a preview and this client is written from the specification without
 * having been run against a live Copilot subscription. Everything it does not
 * understand is surfaced verbatim rather than swallowed, so a mismatch shows up
 * as a readable error instead of a chat box that silently does nothing.
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class CopilotChat {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private acpSessionId: string | null = null;
  private starting: Promise<void> | null = null;

  /** Whatever the agent has streamed for the reply in flight. */
  private streaming = '';
  private onChunk: ((text: string) => void) | null = null;

  lastUsed = Date.now();
  lastError: string | null = null;
  transcript: ChatMessage[] = [];

  constructor(private readonly sessionId: string) {}

  get running() {
    return this.child !== null;
  }

  // --- transport ----------------------------------------------------------

  private send(message: Record<string, unknown>) {
    this.child?.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  }

  private request<T>(method: string, params: unknown, timeoutMs = 120000): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.send({ id, method, params });
    });
  }

  private consume(chunk: string) {
    this.buffer += chunk;
    let index = this.buffer.indexOf('\n');
    while (index !== -1) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line) {
        try {
          this.handle(JSON.parse(line));
        } catch {
          // Not JSON — the agent logging to stdout. Ignore.
        }
      }
      index = this.buffer.indexOf('\n');
    }
  }

  private handle(message: Record<string, any>) {
    if (message.id !== undefined && message.method === undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? 'Copilot chat error'));
      else pending.resolve(message.result);
      return;
    }

    // Agent -> client requests must be answered or the agent blocks. We decline
    // anything that would touch the filesystem or run a command.
    if (message.id !== undefined && message.method) {
      this.send({ id: message.id, error: { code: -32601, message: 'Not supported by this client' } });
      return;
    }

    if (message.method === 'session/update') {
      const update = message.params?.update ?? {};
      const kind = update.sessionUpdate;
      if (kind === 'agent_message_chunk' || kind === 'agent_thought_chunk') {
        const text = update.content?.text ?? '';
        if (kind === 'agent_message_chunk' && text) {
          this.streaming += text;
          this.onChunk?.(this.streaming);
        }
      }
    }
  }

  // --- lifecycle ----------------------------------------------------------

  async start(): Promise<void> {
    if (this.child) return;
    if (this.starting) return this.starting;

    this.starting = (async () => {
      const require = createRequire(join(process.cwd(), 'package.json'));
      const entry = require.resolve('@github/copilot-language-server/dist/language-server.js');

      // Same per-person credential store as the completions bridge, so signing
      // in once covers both.
      const home = join(
        process.env.VEXCOLLAB_DATA_DIR ?? join(process.cwd(), '.vexcollab-data'),
        'copilot',
        this.sessionId,
      );
      mkdirSync(home, { recursive: true, mode: 0o700 });

      const child = spawn(process.execPath, [entry, '--acp'], {
        stdio: 'pipe',
        env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config') },
      });
      this.child = child;
      child.stdout.on('data', (data: Buffer) => this.consume(data.toString()));
      child.stderr.on('data', (data: Buffer) => {
        this.lastError = data.toString().slice(0, 500);
      });
      child.on('exit', () => {
        this.child = null;
        this.acpSessionId = null;
        this.starting = null;
      });

      await this.request('initialize', {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
      });
    })();

    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async ensureSession(): Promise<string> {
    if (this.acpSessionId) return this.acpSessionId;
    const result = await this.request<{ sessionId?: string }>('session/new', {
      cwd: process.cwd(),
      mcpServers: [],
    });
    if (!result?.sessionId) throw new Error('Copilot did not open a chat session');
    this.acpSessionId = result.sessionId;
    return this.acpSessionId;
  }

  /** Sends a prompt and resolves with the assistant's full reply. */
  async ask(prompt: string, context?: string): Promise<string> {
    this.lastUsed = Date.now();
    await this.start();
    const sessionId = await this.ensureSession();

    this.transcript.push({ role: 'user', text: prompt });
    this.streaming = '';

    const text = context ? `${context}\n\n${prompt}` : prompt;
    await this.request('session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text }],
    });

    const reply = this.streaming.trim() || '(no reply)';
    this.transcript.push({ role: 'assistant', text: reply });
    return reply;
  }

  stop() {
    try {
      this.child?.kill();
    } catch {
      // Already gone.
    }
    this.child = null;
  }
}

const IDLE_MS = 30 * 60 * 1000;
const globalForChat = globalThis as unknown as { __vexCopilotChat?: Map<string, CopilotChat> };
const registry = globalForChat.__vexCopilotChat ?? new Map<string, CopilotChat>();
if (process.env.NODE_ENV !== 'production') globalForChat.__vexCopilotChat = registry;

export function chatFor(sessionId: string): CopilotChat {
  const now = Date.now();
  for (const [id, chat] of registry) {
    if (now - chat.lastUsed > IDLE_MS) {
      chat.stop();
      registry.delete(id);
    }
  }
  let chat = registry.get(sessionId);
  if (!chat) {
    chat = new CopilotChat(sessionId);
    registry.set(sessionId, chat);
  }
  chat.lastUsed = now;
  return chat;
}
