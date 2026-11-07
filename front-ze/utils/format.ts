export const formatFileSize = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

export function formatTrackDuration(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}

// Control characters (e.g. Source engine colour bytes like \x01 left in a hostname) and invisible
// spacers render as nothing, so a name made of them looks blank. Zero-width joiners are kept since
// emoji sequences depend on them.
const INVISIBLE_CHARS = /[\p{Cc}​⁠﻿]/gu;

/** A name as it should be shown: invisible characters removed, whitespace collapsed and trimmed. */
export function cleanDisplayName<T extends string | null | undefined>(name: T): T {
    if (typeof name !== 'string') return name;
    return name.replace(/[\t\n\r]+/g, ' ').replace(INVISIBLE_CHARS, '').replace(/\s+/g, ' ').trim() as T;
}

const graphemeSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, {granularity: 'grapheme'})
    : null;

/** Splits text into user-perceived characters, so an emoji is never cut in half. */
export function graphemes(text: string): string[] {
    return graphemeSegmenter
        ? Array.from(graphemeSegmenter.segment(text), s => s.segment)
        : Array.from(text);
}
