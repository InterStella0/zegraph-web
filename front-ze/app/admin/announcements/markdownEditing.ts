export const MOD_KEY =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

export function replaceRange(
  el: HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
  selectionStart = start + text.length,
  selectionEnd = selectionStart,
) {
  el.focus();
  el.setSelectionRange(start, end);
  let applied = false;
  try {
    applied = text
      ? document.execCommand('insertText', false, text)
      : start === end || document.execCommand('delete');
  } catch {
    applied = false;
  }
  if (!applied) {
    el.setRangeText(text, start, end, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  el.setSelectionRange(selectionStart, selectionEnd);
}

export function wrapSelection(el: HTMLTextAreaElement, before: string, after: string, placeholder: string) {
  const { selectionStart: start, selectionEnd: end, value } = el;
  const selected = value.slice(start, end);

  if (value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after) {
    const outer = start - before.length;
    replaceRange(el, outer, end + after.length, selected, outer, outer + selected.length);
    return;
  }

  const body = selected || placeholder;
  const bodyStart = start + before.length;
  replaceRange(el, start, end, before + body + after, bodyStart, bodyStart + body.length);
}

export function insertLink(el: HTMLTextAreaElement) {
  const { selectionStart: start, selectionEnd: end, value } = el;
  const selected = value.slice(start, end);
  if (/^https?:\/\/\S+$/.test(selected)) {
    replaceRange(el, start, end, `[text](${selected})`, start + 1, start + 5);
    return;
  }
  const label = selected || 'text';
  const urlStart = start + label.length + 3;
  replaceRange(el, start, end, `[${label}](https://)`, urlStart, urlStart + 8);
}

const LINE_PREFIXES = /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s?)/;

export function toggleLinePrefix(el: HTMLTextAreaElement, prefix: (index: number) => string, detect: RegExp) {
  const { selectionStart: start, value } = el;
  let { selectionEnd: end } = el;
  if (end > start && value[end - 1] === '\n') end -= 1;

  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = value.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const content = lines.filter((line) => line.trim());
  const remove = content.length > 0 && content.every((line) => detect.test(line));

  let counter = 0;
  const next = lines
    .map((line) => {
      if (remove) return line.replace(detect, '');
      if (!line.trim() && lines.length > 1) return line;
      return prefix(counter++) + line.replace(LINE_PREFIXES, '');
    })
    .join('\n');

  if (lines.length === 1 && !lines[0].trim()) {
    replaceRange(el, lineStart, lineEnd, next);
    return;
  }
  replaceRange(el, lineStart, lineEnd, next, lineStart, lineStart + next.length);
}

export function insertBlock(el: HTMLTextAreaElement, text: string) {
  const { selectionStart: start, selectionEnd: end, value } = el;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const insert = lead + text + trail;
  replaceRange(el, start, end, insert, start + insert.length);
}

export function replaceInTextarea(el: HTMLTextAreaElement, search: string, replacement: string): boolean {
  const index = el.value.indexOf(search);
  if (index === -1) return false;
  el.setRangeText(replacement, index, index + search.length, 'preserve');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function blockRemoval(value: string, index: number, length: number) {
  let start = index;
  let end = index + length;
  while (start > 0 && value[start - 1] === '\n' && index - start < 2) start--;
  while (end < value.length && value[end] === '\n' && end - (index + length) < 2) end++;
  const separator = Math.max(index - start, end - (index + length));
  const replacement = start > 0 && end < value.length ? '\n'.repeat(separator) : '';
  return { start, end, replacement };
}

export function removeBlock(value: string, search: string): string {
  const index = value.indexOf(search);
  if (index === -1) return value;
  const { start, end, replacement } = blockRemoval(value, index, search.length);
  return value.slice(0, start) + replacement + value.slice(end);
}

export function removeBlockFromTextarea(el: HTMLTextAreaElement, search: string): boolean {
  const index = el.value.indexOf(search);
  if (index === -1) return false;
  const { start, end, replacement } = blockRemoval(el.value, index, search.length);
  el.setRangeText(replacement, start, end, 'preserve');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

export function appendBlock(el: HTMLTextAreaElement, text: string) {
  const value = el.value;
  const trailing = value.length - value.replace(/\n+$/, '').length;
  const separator = value.length === 0 ? '' : '\n'.repeat(Math.max(0, 2 - trailing));
  el.setRangeText(separator + text, value.length, value.length, 'preserve');
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
