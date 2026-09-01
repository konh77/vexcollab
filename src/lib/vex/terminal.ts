/*
 * VEXCollab - the V5 user serial port ("print" output from your program).
 * Licensed under AGPL-3.0-only.
 *
 * A V5 brain enumerates two CDC interfaces. One carries the packet protocol
 * used by `V5Session`; the other is a plain 115200-baud stream carrying
 * whatever your program prints, and accepting stdin back. This module owns
 * only the second one, so the terminal keeps working while uploads run.
 */
'use client';

const VEX_USB_VENDOR_ID = 0x2888;

export type TerminalListener = (chunk: string) => void;

export class V5Terminal {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private listeners = new Set<TerminalListener>();
  private stateListeners = new Set<(open: boolean) => void>();
  private decoder = new TextDecoder();
  private closing = false;

  get isOpen() {
    return this.port !== null;
  }

  onData(listener: TerminalListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStateChange(listener: (open: boolean) => void) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private emitState() {
    this.stateListeners.forEach((l) => l(this.isOpen));
  }

  /**
   * Opens the user port. Prefers an already-granted port that nothing else
   * holds open, so after the first permission prompt this is one click.
   */
  async open(): Promise<boolean> {
    if (this.port) return true;
    if (typeof navigator === 'undefined' || !('serial' in navigator)) return false;

    const granted = await navigator.serial.getPorts();
    let port = granted.find(
      (p) => p.getInfo().usbVendorId === VEX_USB_VENDOR_ID && !p.readable,
    );

    if (!port) {
      try {
        port = await navigator.serial.requestPort({
          filters: [{ usbVendorId: VEX_USB_VENDOR_ID }],
        });
      } catch {
        return false; // user dismissed the picker
      }
    }

    if (port.readable) return false; // already in use by the packet session

    await port.open({ baudRate: 115200 });
    this.port = port;
    this.closing = false;
    this.emitState();
    void this.readLoop();
    return true;
  }

  private async readLoop() {
    while (this.port?.readable && !this.closing) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value?.length) {
            const text = this.decoder.decode(value, { stream: true });
            this.listeners.forEach((l) => l(text));
          }
        }
      } catch {
        // Brain unplugged or the stream errored; fall through and clean up.
        break;
      } finally {
        this.reader.releaseLock();
        this.reader = null;
      }
    }
    if (!this.closing) await this.close();
  }

  /** Sends a line to the running program's stdin. */
  async write(text: string) {
    if (!this.port?.writable) return;
    this.writer ??= this.port.writable.getWriter();
    await this.writer.write(new TextEncoder().encode(text));
  }

  async close() {
    this.closing = true;
    try {
      await this.reader?.cancel();
    } catch {
      // Already torn down.
    }
    try {
      this.writer?.releaseLock();
    } catch {
      // Already released.
    }
    this.writer = null;
    try {
      await this.port?.close();
    } catch {
      // Port may be gone with the device.
    }
    this.port = null;
    this.emitState();
  }
}
