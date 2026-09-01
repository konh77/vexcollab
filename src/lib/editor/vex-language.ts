/*
 * VEXCollab - VEX-aware Python intelligence for Monaco.
 * Licensed under AGPL-3.0-only.
 *
 * Monaco ships Python colouring but no Python language service, so completions
 * would otherwise be "words already in the file". This adds real API knowledge:
 * member completions that know what a variable *is*, hovers with signatures,
 * and signature help.
 *
 * Variable types come from a regex scan for `name = Motor(...)` rather than a
 * parser. That covers how V5 code is actually written — devices declared once
 * at module scope — and degrades to offering nothing rather than guessing.
 */
import type { Monaco } from '@monaco-editor/react';
import {
  API_CLASSES,
  API_CONSTANTS,
  API_FUNCTIONS,
  GEAR_SETTINGS,
  PORT_NAMES,
  type ApiClass,
} from '@/lib/vex/api-reference';

const CLASS_BY_NAME = new Map<string, ApiClass>(API_CLASSES.map((c) => [c.name, c]));

/** Maps `left_drive` -> the Motor class, by scanning assignments. */
function inferVariableTypes(source: string): Map<string, ApiClass> {
  const types = new Map<string, ApiClass>();
  const pattern = /^\s*([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\s*\(/gm;
  for (const match of source.matchAll(pattern)) {
    const cls = CLASS_BY_NAME.get(match[2]);
    if (cls) types.set(match[1], cls);
  }
  return types;
}

/** `brain.screen.` and `controller.axis3.` need one more hop. */
const NESTED: Record<string, string[]> = {
  screen: ['print', 'clear_screen', 'set_cursor', 'set_pen_color', 'set_fill_color', 'draw_rectangle', 'draw_circle', 'draw_line', 'set_font', 'next_row'],
  timer: ['time', 'clear', 'event'],
  battery: ['capacity', 'voltage', 'current'],
  axis1: ['position', 'value', 'changed'],
  axis2: ['position', 'value', 'changed'],
  axis3: ['position', 'value', 'changed'],
  axis4: ['position', 'value', 'changed'],
  buttonL1: ['pressing', 'pressed', 'released'],
  buttonL2: ['pressing', 'pressed', 'released'],
  buttonR1: ['pressing', 'pressed', 'released'],
  buttonR2: ['pressing', 'pressed', 'released'],
  buttonA: ['pressing', 'pressed', 'released'],
  buttonB: ['pressing', 'pressed', 'released'],
  buttonX: ['pressing', 'pressed', 'released'],
  buttonY: ['pressing', 'pressed', 'released'],
};

export function registerVexPython(monaco: Monaco): () => void {
  const { languages, Range } = monaco;
  const Kind = languages.CompletionItemKind;
  const InsertRule = languages.CompletionItemInsertTextRule;

  const completions = languages.registerCompletionItemProvider('python', {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const line = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const word = model.getWordUntilPosition(position);
      const range = new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);

      // --- member access: something.<caret>
      const dotted = line.match(/([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.\w*$/);
      if (dotted) {
        const parts = dotted[1].split('.');
        const root = parts[0];
        const types = inferVariableTypes(model.getValue());

        // one hop: brain.screen.<caret>
        if (parts.length > 1) {
          const members = NESTED[parts[parts.length - 1]];
          if (members) {
            return {
              suggestions: members.map((name) => ({
                label: name,
                kind: Kind.Method,
                insertText: `${name}($0)`,
                insertTextRules: InsertRule.InsertAsSnippet,
                range,
              })),
            };
          }
          return { suggestions: [] };
        }

        if (root === 'Ports') {
          return {
            suggestions: PORT_NAMES.map((p) => ({
              label: p.replace('Ports.', ''),
              kind: Kind.EnumMember,
              insertText: p.replace('Ports.', ''),
              range,
            })),
          };
        }
        if (root === 'GearSetting') {
          return {
            suggestions: GEAR_SETTINGS.map((g) => ({
              label: g.name.replace('GearSetting.', ''),
              kind: Kind.EnumMember,
              detail: g.detail,
              insertText: g.name.replace('GearSetting.', ''),
              range,
            })),
          };
        }

        const cls = types.get(root);
        if (!cls) return { suggestions: [] };
        return {
          suggestions: cls.members.map((member) => ({
            label: member.name,
            kind: member.snippet ? Kind.Method : Kind.Property,
            detail: member.signature,
            documentation: member.detail,
            insertText: member.snippet ?? member.name,
            insertTextRules: member.snippet ? InsertRule.InsertAsSnippet : undefined,
            range,
          })),
        };
      }

      // --- bare identifiers
      return {
        suggestions: [
          ...API_CLASSES.map((cls) => ({
            label: cls.name,
            kind: Kind.Class,
            detail: cls.constructor.replace(/\$\{\d+:([^}]*)\}/g, '$1'),
            documentation: cls.detail,
            insertText: cls.constructor,
            insertTextRules: InsertRule.InsertAsSnippet,
            range,
          })),
          ...API_FUNCTIONS.map((fn) => ({
            label: fn.name,
            kind: Kind.Function,
            detail: fn.signature,
            documentation: fn.detail,
            insertText: fn.snippet ?? fn.name,
            insertTextRules: InsertRule.InsertAsSnippet,
            range,
          })),
          ...API_CONSTANTS.map((c) => ({
            label: c.name,
            kind: Kind.Constant,
            detail: c.detail,
            insertText: c.name,
            range,
          })),
          { label: 'Ports', kind: Kind.Enum, detail: 'Smart port PORT1..PORT21', insertText: 'Ports.', range },
          { label: 'GearSetting', kind: Kind.Enum, detail: 'Motor cartridge', insertText: 'GearSetting.', range },
        ],
      };
    },
  });

  const hovers = languages.registerHoverProvider('python', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const cls = CLASS_BY_NAME.get(word.word);
      if (cls) {
        return {
          contents: [
            { value: `**${cls.name}** — ${cls.detail}` },
            { value: '```python\n' + cls.constructor.replace(/\$\{\d+:([^}]*)\}/g, '$1') + '\n```' },
          ],
        };
      }

      for (const candidate of API_CLASSES) {
        const member = candidate.members.find((m) => m.name === word.word);
        if (member) {
          return {
            contents: [
              { value: '```python\n' + member.signature + '\n```' },
              { value: member.detail },
            ],
          };
        }
      }

      const fn = API_FUNCTIONS.find((f) => f.name === word.word);
      if (fn) {
        return { contents: [{ value: '```python\n' + fn.signature + '\n```' }, { value: fn.detail }] };
      }

      const constant = API_CONSTANTS.find((c) => c.name === word.word);
      if (constant) return { contents: [{ value: `**${constant.name}** — ${constant.detail}` }] };

      return null;
    },
  });

  return () => {
    completions.dispose();
    hovers.dispose();
  };
}
