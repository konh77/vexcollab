/*
 * VEXCollab - GitHub Copilot bridge.
 * Licensed under AGPL-3.0-only.
 *
 * Runs GitHub's official `@github/copilot-language-server` as a subprocess and
 * speaks LSP to it over stdio, exposing just what the editor needs: sign-in
 * (device flow) and inline completions.
 *
 * This is the sanctioned integration path — the same server Neovim and Emacs
 * use. It needs an active Copilot subscription; VEXCollab neither proxies nor
 * stores any credential, the language server owns the token.
 *
 * Off unless VEXCOLLAB_COPILOT=1, so nobody pays a subprocess they did not ask
 * for.
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export interface CopilotStatus {
  enabled: boolean;
  running: boolean;
  kind: string;
  message: string;
  signedIn: boolean;
  userCode?: string;
  verificationUri?: string;
  error?: string;
}

export interface CopilotSuggestion {
  insertText: string;
  range?: { start: { line: number; character: number }; end: { line: number; character: number } };
}

class CopilotBridge {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private starting: Promise<void> | null = null;

  private statusKind = 'Unknown';
  private statusMessage = '';
  private userCode: string | undefined;
  private verificationUri: string | undefined;
  private lastError: string | undefined;
  private versions = new Map<string, number>();

  get enabled() {
    return process.env.VEXCOLLAB_COPILOT === '1';
  }

  // --- transport ----------------------------------------------------------

  private send(message: Record<string, unknown>) {
    if (!this.child) return;
    const body = JSON.stringify({ jsonrpc: '2.0', ...message });
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }

  private request<T>(method: string, params: unknown, timeoutMs = 20000): Promise<T> {
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
        reject: (reason) => {
          clearTimeout(timer);
          reject(reason);
        },
      });
      this.send({ id, method, params });
    });
  }

  private notify(method: string, params: unknown) {
    this.send({ method, params });
  }

  private consume(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const header = this.buffer.indexOf('\r\n\r\n');
      if (header === -1) return;
      const match = /Content-Length: (\d+)/i.exec(this.buffer.subarray(0, header).toString());
      if (!match) return;
      const length = Number(match[1]);
      const start = header + 4;
      if (this.buffer.length < start + length) return;
      const raw = this.buffer.subarray(start, start + length).toString();
      this.buffer = this.buffer.subarray(start + length);
      try {
        this.handle(JSON.parse(raw));
      } catch {
        // A malformed frame must not take the bridge down.
      }
    }
  }

  private handle(message: Record<string, any>) {
    // Response to something we asked.
    if (message.id !== undefined && message.method === undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? 'Copilot error'));
      else pending.resolve(message.result);
      return;
    }

    // Server -> client request: must be answered or the server stalls.
    if (message.id !== undefined && message.method) {
      if (message.method === 'window/showDocument') {
        // This carries the device-flow URL; surface it instead of opening a
        // browser on whichever machine happens to run the server.
        this.verificationUri = message.params?.uri;
        this.send({ id: message.id, result: { success: true } });
        return;
      }
      this.send({ id: message.id, result: null });
      return;
    }

    // Notifications.
    if (message.method === 'didChangeStatus') {
      this.statusKind = message.params?.kind ?? this.statusKind;
      this.statusMessage = message.params?.message ?? '';
      if (this.statusKind === 'Normal') this.userCode = undefined;
    }
  }

  // --- lifecycle ----------------------------------------------------------

  async start(): Promise<void> {
    if (!this.enabled) throw new Error('Copilot is not enabled');
    if (this.child) return;
    if (this.starting) return this.starting;

    this.starting = (async () => {
      // Resolve from the project root, not import.meta.url: inside Next's
      // compiled server output that points into .next/, where node_modules is
      // not reachable.
      const require = createRequire(join(process.cwd(), 'package.json'));
      let entry: string;
      try {
        entry = require.resolve('@github/copilot-language-server/dist/language-server.js');
      } catch {
        const message =
          'Copilot needs @github/copilot-language-server. Run: npm install @github/copilot-language-server';
        this.lastError = message;
        throw new Error(message);
      }

      this.lastError = undefined;
      const child = spawn(process.execPath, [entry, '--stdio'], { stdio: 'pipe' });
      this.child = child;
      child.stdout.on('data', (chunk: Buffer) => this.consume(chunk));
      child.on('exit', () => {
        this.child = null;
        this.starting = null;
        this.statusKind = 'Unknown';
      });
      child.on('error', (error) => {
        this.lastError = error.message;
      });

      await this.request('initialize', {
        processId: process.pid,
        clientInfo: { name: 'VEXCollab', version: '0.1.0' },
        capabilities: { workspace: { workspaceFolders: true } },
        workspaceFolders: [],
        initializationOptions: {
          editorInfo: { name: 'VEXCollab', version: '0.1.0' },
          editorPluginInfo: { name: 'VEXCollab', version: '0.1.0' },
        },
      });
      this.notify('initialized', {});
    })();

    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  status(): CopilotStatus {
    return {
      enabled: this.enabled,
      running: this.child !== null,
      kind: this.statusKind,
      message: this.statusMessage,
      signedIn: this.statusKind === 'Normal',
      userCode: this.userCode,
      verificationUri: this.verificationUri,
      error: this.lastError,
    };
  }

  async signIn(): Promise<CopilotStatus> {
    await this.start();
    const result = await this.request<any>('signIn', {});
    this.userCode = result?.userCode;
    this.verificationUri = result?.verificationUri ?? this.verificationUri;

    // Finishing the device flow blocks until the user completes it in a
    // browser, so it is deliberately not awaited — the status endpoint reports
    // progress instead.
    if (result?.command) {
      this.request('workspace/executeCommand', {
        command: result.command.command,
        arguments: result.command.arguments ?? [],
      }, 15 * 60 * 1000).catch((error) => {
        this.lastError = error.message;
      });
    }
    return this.status();
  }

  async signOut(): Promise<CopilotStatus> {
    if (this.child) await this.request('signOut', {}).catch(() => undefined);
    this.userCode = undefined;
    this.statusKind = 'Error';
    return this.status();
  }

  /** Pushes the current buffer and asks for ghost text at the caret. */
  async complete(
    uri: string,
    text: string,
    line: number,
    character: number,
  ): Promise<CopilotSuggestion[]> {
    await this.start();

    const version = (this.versions.get(uri) ?? 0) + 1;
    if (version === 1) {
      this.notify('textDocument/didOpen', {
        textDocument: { uri, languageId: 'python', version, text },
      });
    } else {
      this.notify('textDocument/didChange', {
        textDocument: { uri, version },
        contentChanges: [{ text }],
      });
    }
    this.versions.set(uri, version);
    this.notify('textDocument/didFocus', { textDocument: { uri } });

    const result = await this.request<{ items?: CopilotSuggestion[] }>(
      'textDocument/inlineCompletion',
      {
        textDocument: { uri, version },
        position: { line, character },
        context: { triggerKind: 2 },
        formattingOptions: { tabSize: 4, insertSpaces: true },
      },
      10000,
    );
    return result?.items ?? [];
  }
}

/** One bridge per server process, kept across hot reloads in dev. */
const globalForCopilot = globalThis as unknown as { __vexCopilot?: CopilotBridge };
export const copilot = globalForCopilot.__vexCopilot ?? new CopilotBridge();
if (process.env.NODE_ENV !== 'production') globalForCopilot.__vexCopilot = copilot;
