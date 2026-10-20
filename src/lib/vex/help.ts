/*
 * VEXCollab - the data behind the Help box.
 * Licensed under AGPL-3.0-only.
 *
 * Turns the API reference into something to browse: one flat list of entries
 * that can be searched, grouped, looked up from the code under the cursor, and
 * turned into an example written with the project's own variable names.
 *
 * The descriptions are the ones in api-reference.ts, which were written from the
 * public VEXcode V5 Python documentation. Nothing here is taken from VEXcode's
 * own help text.
 */
import {
  API_CLASSES,
  API_CONSTANTS,
  API_FUNCTIONS,
  PARAM_VALUES,
  type ApiClass,
  type ApiMember,
  type ParamKind,
} from './api-reference';

export type HelpCategory = 'Motion' | 'Sensing' | 'Controller' | 'Brain' | '3-wire' | 'Basics';

export const HELP_CATEGORIES: HelpCategory[] = [
  'Motion',
  'Sensing',
  'Controller',
  'Brain',
  '3-wire',
  'Basics',
];

/** Which shelf each class sits on. A class not listed here falls under Sensing. */
const CATEGORY_OF: Record<string, HelpCategory> = {
  Motor: 'Motion',
  MotorGroup: 'Motion',
  DriveTrain: 'Motion',
  Controller: 'Controller',
  Brain: 'Brain',
  Sonar: '3-wire',
  Bumper: '3-wire',
  Limit: '3-wire',
  Encoder: '3-wire',
  Potentiometer: '3-wire',
  Line: '3-wire',
  Light: '3-wire',
  Servo: '3-wire',
  AddressableLed: '3-wire',
  Pneumatic: '3-wire',
};

export interface HelpParam {
  name: string;
  kind: ParamKind;
  optional: boolean;
  /** What may be passed. Empty for a free-form value such as a number. */
  values: { label: string; detail: string }[];
}

export interface HelpEntry {
  id: string;
  type: 'member' | 'function' | 'class';
  category: HelpCategory;
  /** The class this belongs to; null for a free function. */
  className: string | null;
  name: string;
  signature: string;
  detail: string;
  /** Monaco snippet text, when there is one. */
  snippet: string | null;
  params: HelpParam[];
  returns: string | null;
}

/** `spin(${1:FORWARD}, ${2:50})` -> `spin(FORWARD, 50)` */
export function resolveSnippet(snippet: string): string {
  return snippet
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}|\$\d+/g, '');
}

function paramsOf(member: ApiMember): HelpParam[] {
  return (member.params ?? []).map((param) => ({
    name: param.name,
    kind: param.kind,
    optional: Boolean(param.optional),
    values: PARAM_VALUES[param.kind] ?? [],
  }));
}

function returnsOf(signature: string): string | null {
  const arrow = signature.indexOf('->');
  return arrow === -1 ? null : signature.slice(arrow + 2).trim() || null;
}

function memberEntry(cls: ApiClass, member: ApiMember): HelpEntry {
  return {
    id: `${cls.name}.${member.name}`,
    type: 'member',
    category: CATEGORY_OF[cls.name] ?? 'Sensing',
    className: cls.name,
    name: member.name,
    signature: member.signature,
    detail: member.detail,
    snippet: member.snippet ?? null,
    params: paramsOf(member),
    returns: returnsOf(member.signature),
  };
}

let cached: HelpEntry[] | null = null;

/** Every entry, built once. */
export function helpEntries(): HelpEntry[] {
  if (cached) return cached;

  const entries: HelpEntry[] = [];
  for (const cls of API_CLASSES) {
    // The shape of the class itself: what it is and how it is created.
    entries.push({
      id: `class.${cls.name}`,
      type: 'class',
      category: CATEGORY_OF[cls.name] ?? 'Sensing',
      className: cls.name,
      name: cls.name,
      signature: resolveSnippet(cls.constructor),
      detail: cls.detail,
      snippet: cls.constructor,
      params: (cls.constructorParams ?? []).map((param) => ({
        name: param.name,
        kind: param.kind,
        optional: Boolean(param.optional),
        values: PARAM_VALUES[param.kind] ?? [],
      })),
      returns: null,
    });
    for (const member of cls.members) entries.push(memberEntry(cls, member));
  }

  for (const fn of API_FUNCTIONS) {
    entries.push({
      id: `fn.${fn.name}`,
      type: 'function',
      category: 'Basics',
      className: null,
      name: fn.name,
      signature: fn.signature,
      detail: fn.detail,
      snippet: fn.snippet ?? null,
      params: paramsOf(fn),
      returns: returnsOf(fn.signature),
    });
  }

  cached = entries;
  return entries;
}

export function entryById(id: string): HelpEntry | undefined {
  return helpEntries().find((entry) => entry.id === id);
}

/** Entries whose name matches, for "used on: Motor, MotorGroup". */
export function sameNameElsewhere(entry: HelpEntry): HelpEntry[] {
  return helpEntries().filter(
    (other) => other.type === 'member' && other.name === entry.name && other.id !== entry.id,
  );
}

// --- searching ---------------------------------------------------------------

/**
 * Ranks by how directly the text matches: the name first, then the class, then
 * the description. Plain substring matching on purpose -- a list this size does
 * not need fuzziness, and "why did that appear" should be obvious.
 */
export function searchHelp(query: string, entries: HelpEntry[] = helpEntries()): HelpEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return entries;

  const scored: { entry: HelpEntry; score: number }[] = [];
  for (const entry of entries) {
    let score = 0;
    let matchedAll = true;
    for (const term of terms) {
      const name = entry.name.toLowerCase();
      const klass = (entry.className ?? '').toLowerCase();
      if (name === term) score += 100;
      else if (name.startsWith(term)) score += 60;
      else if (name.includes(term)) score += 40;
      else if (klass.startsWith(term)) score += 30;
      else if (klass.includes(term)) score += 20;
      else if (entry.detail.toLowerCase().includes(term)) score += 8;
      else if (entry.signature.toLowerCase().includes(term)) score += 5;
      else {
        matchedAll = false;
        break;
      }
    }
    if (matchedAll) scored.push({ entry, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.entry);
}

// --- examples ----------------------------------------------------------------

export interface DeclaredLike {
  name: string;
  type: string;
}

/** A readable stand-in when the project has no variable of that class. */
function placeholderName(className: string): string {
  return className.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}

/**
 * The call written the way it would be in this project: `left_drive.spin(...)`
 * if there is a Motor called left_drive, otherwise a neutral `motor.spin(...)`.
 */
export function instanceNameFor(className: string, declared: DeclaredLike[]): string {
  return declared.find((device) => device.type === className)?.name ?? placeholderName(className);
}

export function exampleFor(entry: HelpEntry, declared: DeclaredLike[]): string | null {
  if (entry.type === 'function') {
    return entry.snippet ? resolveSnippet(entry.snippet) : null;
  }
  if (entry.type === 'class') {
    return entry.snippet ? `${placeholderName(entry.name)} = ${resolveSnippet(entry.snippet)}` : null;
  }
  const owner = instanceNameFor(entry.className ?? '', declared);
  // A member with no snippet is a property, read as owner.name
  return entry.snippet ? `${owner}.${resolveSnippet(entry.snippet)}` : `${owner}.${entry.name}`;
}

/** The text to drop into the editor: a snippet with tab stops, or plain text. */
export function insertionFor(
  entry: HelpEntry,
  declared: DeclaredLike[],
): { text: string; snippet: boolean } | null {
  if (entry.type === 'function') {
    return entry.snippet ? { text: entry.snippet, snippet: true } : null;
  }
  if (entry.type === 'class') {
    return entry.snippet
      ? { text: `${placeholderName(entry.name)} = ${entry.snippet}`, snippet: true }
      : null;
  }
  const owner = instanceNameFor(entry.className ?? '', declared);
  return entry.snippet
    ? { text: `${owner}.${entry.snippet}`, snippet: true }
    : { text: `${owner}.${entry.name}`, snippet: false };
}

// --- what is under the cursor ------------------------------------------------

/**
 * Finds the call or property at a position in a line of code, so the Help box
 * can follow the cursor. `receiver.member` is resolved through the project's own
 * declarations -- if `left_drive` is a Motor, `left_drive.spin` is Motor.spin --
 * and a bare `wait(` or `Motor(` is found by name.
 */
export function entryAtCursor(
  lineText: string,
  column: number,
  declared: DeclaredLike[],
): HelpEntry | null {
  const index = column - 1;

  for (const match of lineText.matchAll(/([A-Za-z_]\w*)\.([A-Za-z_]\w*)/g)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (index < start || index > end) continue;

    const type = declared.find((device) => device.name === match[1])?.type;
    if (!type) continue;
    return helpEntries().find((entry) => entry.id === `${type}.${match[2]}`) ?? null;
  }

  for (const match of lineText.matchAll(/\b([A-Za-z_]\w*)\b/g)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (index < start || index > end) continue;
    // A word that follows a dot belongs to the pair handled above.
    if (lineText[start - 1] === '.') continue;
    const found = helpEntries().find(
      (entry) => (entry.type === 'function' || entry.type === 'class') && entry.name === match[1],
    );
    if (found) return found;
  }
  return null;
}

// --- reference tables --------------------------------------------------------

/** Constants grouped by what they are for, for the units card. */
export function constantGroups(): { label: string; items: { name: string; detail: string }[] }[] {
  const groups = new Map<string, { name: string; detail: string }[]>();
  for (const constant of API_CONSTANTS) {
    const list = groups.get(constant.detail) ?? [];
    list.push(constant);
    groups.set(constant.detail, list);
  }
  return [...groups].map(([label, items]) => ({ label, items }));
}
