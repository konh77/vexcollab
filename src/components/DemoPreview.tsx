/*
 * VEXCollab - the product shot on the landing page.
 * Licensed under AGPL-3.0-only.
 *
 * A still of the real editor: same fonts, same Xcode-light syntax colours,
 * same rails as the room you get when you click through. It is markup rather
 * than a screenshot so it stays sharp, themes correctly, and never goes stale
 * when the UI changes.
 */
'use client';

import { TrafficLights } from './TrafficLights';

export function DemoPreview() {
  return (
    <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-t-2xl bg-shell shadow-[0_-1px_0_rgba(0,0,0,0.06),0_24px_60px_rgba(0,0,0,0.13)]">
      {/* Title bar */}
      <div className="vc-vibrancy flex h-9 shrink-0 items-center gap-3 border-b border-edge px-3.5">
        <TrafficLights />
        <span className="font-mono text-[11px] text-ink-dim">xgr7rdvi</span>
        <span className="ml-auto flex -space-x-1.5">
          <span className="grid size-[18px] place-items-center rounded-full border-2 border-white bg-ok text-[9px] font-semibold text-white">
            K
          </span>
          <span className="grid size-[18px] place-items-center rounded-full border-2 border-white bg-[#007aff] text-[9px] font-semibold text-white">
            M
          </span>
        </span>
      </div>

      <div className="flex h-[300px] min-h-0">
        {/* Files */}
        <div className="hidden w-[150px] shrink-0 border-r border-edge bg-panel py-2.5 text-[12px] sm:block">
          <div className="bg-black/[0.05] px-3.5 py-1.5 font-medium">main.py</div>
          <div className="px-3.5 py-1.5 text-ink-dim">README.md</div>
          <div className="px-3.5 py-1.5 text-ink-dim">lib/drive.py</div>
        </div>

        {/* Code */}
        <div className="min-w-0 flex-1 overflow-hidden px-3.5 pt-3 font-mono text-[11.5px] leading-[1.75]">
          <div>
            <span className="text-[#AD3DA4]">from</span> vex{' '}
            <span className="text-[#AD3DA4]">import</span> *
          </div>
          <div className="h-3" />
          <div>
            brain = <span className="text-[#3900A0]">Brain</span>()
          </div>
          <div>
            controller = <span className="text-[#3900A0]">Controller</span>(PRIMARY)
          </div>
          <div>
            left_drive = <span className="text-[#3900A0]">Motor</span>(Ports.PORT1)
          </div>
          <div className="h-3" />
          <div>
            <span className="text-[#AD3DA4]">def</span>{' '}
            <span className="text-[#326D74]">drive</span>(forward, turn):
          </div>
          <div className="pl-6 text-[#D12F1B]">&quot;&quot;&quot;Simple arcade drive.&quot;&quot;&quot;</div>
          <div className="relative pl-6">
            left_drive.spin(FORWARD, forward + turn, PERCENT)
            <span className="absolute -top-4 ml-1 rounded-t rounded-br bg-[#007aff] px-1 py-px font-sans text-[9px] font-semibold text-white">
              Maya
            </span>
          </div>
          <div className="pl-6">right_drive.spin(FORWARD, forward - turn, PERCENT)</div>
        </div>

        {/* Brain rail */}
        <div className="hidden w-[190px] shrink-0 border-l border-edge px-3.5 py-3 text-[11.5px] md:block">
          <div className="mb-3 flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-ok" />
            <span className="font-medium">V5 brain</span>
          </div>
          {[
            ['Battery', '87%'],
            ['Team', '7842B'],
            ['Devices', '6'],
            ['vexOS', '1.1.5'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between py-0.5">
              <span className="text-ink-dim">{label}</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
          <div className="mt-3 rounded-md bg-vex py-1.5 text-center text-[11px] font-medium text-white">
            Upload to slot 1
          </div>
        </div>
      </div>
    </div>
  );
}
