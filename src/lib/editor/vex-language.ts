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
  PARAM_VALUES,
  PORT_NAMES,
  type ApiClass,
  type ApiMember,
  type ApiParam,
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

/**
 * Where the caret is inside a call: which function, and which argument.
 * Walks back over balanced brackets so a nested call does not confuse it.
 */
function callContext(line: string): { name: string; argIndex: number } | null {
  let depth = 0;
  let argIndex = 0;
  for (let i = line.length - 1; i >= 0; i--) {
    const ch = line[i];
    if (ch === ')' || ch === ']' || ch === '}') depth++;
    else if (ch === ']' || ch === '}') depth--;
    else if (ch === '(') {
      if (depth === 0) {
        const before = line.slice(0, i);
        const match = /([A-Za-z_]\w*)\s*$/.exec(before);
        return match ? { name: match[1], argIndex } : null;
      }
      depth--;
    } else if (ch === ',' && depth === 0) {
      argIndex++;
    }
  }
  return null;
}

/** Finds the API entry for a called name, whether method or free function. */
function lookupCallable(
  name: string,
): { params?: ApiParam[]; signature: string; detail: string } | null {
  for (const cls of API_CLASSES) {
    if (cls.name === name) {
      return {
        params: cls.constructorParams,
        signature: cls.constructor.replace(/\$\{\d+:([^}]*)\}/g, '$1'),
        detail: cls.detail,
      };
    }
    const member: ApiMember | undefined = cls.members.find((m) => m.name === name);
    if (member?.params) {
      return { params: member.params, signature: member.signature, detail: member.detail };
    }
  }
  const fn = API_FUNCTIONS.find((f) => f.name === name);
  if (fn) return { params: fn.params, signature: fn.signature, detail: fn.detail };
  return null;
}

/** Literal assignments give a variable an obvious type: `armed = True` -> bool. */
function inferLiteralTypes(source: string): Map<string, string> {
  const types = new Map<string, string>();
  const pattern = /^\s*([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/gm;
  for (const match of source.matchAll(pattern)) {
    const value = match[2];
    let kind: string | null = null;
    if (/^(True|False)$/.test(value)) kind = 'bool';
    else if (/^-?\d+$/.test(value)) kind = 'int';
    else if (/^-?\d*\.\d+$/.test(value)) kind = 'float';
    else if (/^(['"]).*\1$/.test(value)) kind = 'str';
    else if (/^\[.*\]$/.test(value)) kind = 'list';
    else if (/^\{.*\}$/.test(value)) kind = 'dict';
    if (kind) types.set(match[1], kind);
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

      // --- inside a call: offer only what fits this parameter
      const call = callContext(line);
      if (call && !/\.\w*$/.test(line)) {
        const callable = lookupCallable(call.name);
        const param = callable?.params?.[call.argIndex];
        if (param) {
          const values = PARAM_VALUES[param.kind];
          if (values.length > 0) {
            return {
              suggestions: values.map((value) => ({
                label: value.label,
                kind: param.kind === 'boolean' ? Kind.Keyword : Kind.EnumMember,
                detail: `${param.name} — ${value.detail}`,
                insertText: value.label,
                // Sorted ahead of the generic list, which stays available.
                sortText: '0',
                range,
              })),
            };
          }
        }
      }

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

      // A device the file declares, or a plain literal — say what it is.
      const source = model.getValue();
      const deviceType = inferVariableTypes(source).get(word.word);
      if (deviceType) {
        return {
          contents: [
            { value: '```python\n' + `${word.word}: ${deviceType.name}` + '\n```' },
            { value: deviceType.detail },
          ],
        };
      }
      const literal = inferLiteralTypes(source).get(word.word);
      if (literal) {
        return { contents: [{ value: '```python\n' + `${word.word}: ${literal}` + '\n```' }] };
      }

      return null;
    },
  });

  const signatures = languages.registerSignatureHelpProvider('python', {
    signatureHelpTriggerCharacters: ['(', ','],
    provideSignatureHelp(model, position) {
      const line = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const call = callContext(line);
      if (!call) return null;
      const callable = lookupCallable(call.name);
      if (!callable) return null;

      const parameters = (callable.params ?? []).map((p) => ({
        label: p.name,
        documentation: p.optional ? `${p.kind} (optional)` : p.kind,
      }));

      return {
        value: {
          signatures: [
            {
              label: callable.signature,
              documentation: callable.detail,
              parameters,
            },
          ],
          activeSignature: 0,
          activeParameter: Math.min(call.argIndex, Math.max(parameters.length - 1, 0)),
        },
        dispose() {
          // Nothing retained.
        },
      };
    },
  });

  // Clicking a name lights up every other use of it. Monaco only does this for
  // languages that provide highlights, and Python here has no language service.
  const highlights = languages.registerDocumentHighlightProvider('python', {
    provideDocumentHighlights(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word || word.word.length < 2) return [];

      const matches = model.findMatches(
        word.word,
        true,   // search the whole model
        false,  // not a regex
        true,   // match case
        ' \t\n.,()[]{}:;=+-*/<>!&|%',  // word separators
        false,
      );

      return matches.map((match) => ({
        range: match.range,
        kind: languages.DocumentHighlightKind.Text,
      }));
    },
  });

  return () => {
    completions.dispose();
    hovers.dispose();
    signatures.dispose();
    highlights.dispose();
  };
}
