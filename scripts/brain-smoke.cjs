/* VEXCollab - optional real-USB smoke test. AGPL-3.0-only. */
require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const { V5Session } = require('../src/lib/vex/session.ts');
const { FileDownloadTarget, FileVendor, SerialDeviceType } = require('../src/lib/v5-serial-protocol/Vex.ts');

const ports = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
if (!ports.length || ports.some(port => !port.startsWith('/dev/'))) {
  console.error('Usage: node scripts/brain-smoke.cjs /dev/cu.usbmodem… [second-port] [--transfer]');
  process.exit(1);
}
class NativePort extends EventTarget {
  readable = null;
  writable = null;
  constructor(devicePath) { super(); this.devicePath = devicePath; }
  getInfo() { return { usbVendorId: 0x2888, usbProductId: SerialDeviceType.V5_BRAIN }; }
  async open() {
    this.child = spawn('python3', [path.join(__dirname, 'serial-bridge.py'), this.devicePath]);
    await once(this.child, 'spawn');
    this.child.stderr.on('data', data => process.stderr.write(data));
    this.readable = new ReadableStream({
      start: controller => {
        this.child.stdout.on('data', data => { try { controller.enqueue(new Uint8Array(data)); } catch {} });
        this.child.stdout.on('end', () => { try { controller.close(); } catch {} });
      },
      cancel() {},
    });
    this.writable = new WritableStream({
      write: data => new Promise((resolve, reject) => this.child.stdin.write(data, error => error ? reject(error) : resolve())),
      close: () => { this.child.stdin.end(); },
    });
  }
  async close() {
    this.child?.stdin.end();
    if (this.child && this.child.exitCode === null) {
      await Promise.race([once(this.child, 'exit'), new Promise(resolve => setTimeout(resolve, 500))]);
      if (this.child.exitCode === null) this.child.kill();
    }
    this.readable = this.writable = null;
  }
}
const nativePorts = ports.map(port => new NativePort(port));
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
  serial: { getPorts: async () => nativePorts, requestPort: async () => { throw new Error('No answering V5 port'); } },
} });

const session = new V5Session();
const report = console.log.bind(console);
// The unchanged vendor library logs raw packets; keep diagnostics readable.
console.log = () => {};
const timeout = setTimeout(() => { console.error('Hardware test timed out.'); process.exit(1); }, 60000);
(async () => {
  try {
    assert.equal(await session.connect(), true, session.getSnapshot().lastError);
    const state = session.getSnapshot();
    assert.equal(state.programsLoaded, true, state.lastError);
    report(JSON.stringify({ connection: state.connectionState, name: state.brainName,
      vexOS: state.systemVersion, battery: state.batteryPercent, running: state.isRunningProgram,
      devices: state.devices, programs: state.programs }, null, 2));
    await Promise.all([session.refresh(), session.refresh(), session.refreshPrograms()]);
    assert.equal(session.getSnapshot().lastError, null);
    report('PASS: connection, status, program listing, and queued refreshes.');
    if (process.argv.includes('--python')) {
      await require('./python-smoke.cjs')(session, report);
    }
    if (process.argv.includes('--cleanup-test-files')) {
      await session.exclusive(async () => {
        const brain = session.device.brain;
        for (const file of await brain.listFiles() ?? []) {
          if (!/^vc_[a-f0-9]{10}\.txt$/.test(file.filename) || file.size !== 9003) continue;
          const expected = Uint8Array.from({ length: 9003 }, (_, index) => (index * 37 + 11) % 256);
          assert.deepEqual(await brain.readFile(file), expected, 'Unrecognized file; leaving it unchanged');
          await brain.removeFile(file);
          report(`Removed verified leftover smoke-test file ${file.filename}.`);
        }
      });
    }
    if (process.argv.includes('--transfer')) {
      assert.equal(state.isRunningProgram, false, 'Stop the running program before the transfer test.');
      const filename = `vc_${randomBytes(5).toString('hex')}.txt`;
      report(`Temporary transfer test: ${filename}`);
      const payload = Uint8Array.from({ length: 9003 }, (_, index) => (index * 37 + 11) % 256);
      await session.exclusive(async () => {
        const brain = session.device.brain;
        const before = await brain.listFiles();
        assert(before && !before.some(file => file.filename === filename));
        try {
          assert.equal(await brain.writeFile({ filename, buf: payload, vendor: FileVendor.USER,
            downloadTarget: FileDownloadTarget.FILE_TARGET_QSPI, exttype: 'txt', autoRun: false }), true);
          const bytes = await brain.readFile(filename);
          assert.deepEqual(bytes, payload);
          report(`PASS: ${payload.length} bytes uploaded and read back exactly (including multiple chunks and unaligned tail).`);
        } finally {
          await brain.removeFile(filename);
          const after = await brain.listFiles();
          assert(after && !after.some(file => file.filename === filename), `Remove temporary test file ${filename}`);
          const fingerprint = files => files.map(file => [file.filename, file.size, file.crc32]).sort((a, b) => a[0].localeCompare(b[0]));
          assert.deepEqual(fingerprint(after), fingerprint(before));
          report('PASS: temporary test file removed; existing files retained.');
        }
      });
    }
  } finally {
    await session.disconnect();
    await Promise.all(nativePorts.map(port => port.close()));
    clearTimeout(timeout);
  }
})().then(() => {
  // The vendored device leaves an idle interval alive even after disconnect.
  process.exit(0);
}, error => { console.error(error); process.exit(1); });
