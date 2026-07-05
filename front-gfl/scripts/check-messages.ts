// Verifies every locale under messages/ has the same key set as en.json (the source of truth).
// Missing keys aren't fatal (i18n/request.ts deep-merges English as a fallback) but should be
// caught before they ship untranslated. Run with: bunx tsx scripts/check-messages.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = path.join(__dirname, '..', 'messages');
const BASE_LOCALE = 'en';

function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    return Object.entries(obj).flatMap(([key, value]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return collectKeys(value as Record<string, unknown>, fullKey);
        }
        return [fullKey];
    });
}

function loadMessages(locale: string): Record<string, unknown> {
    const file = path.join(MESSAGES_DIR, `${locale}.json`);
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

const baseKeys = new Set(collectKeys(loadMessages(BASE_LOCALE)));
const locales = fs
    .readdirSync(MESSAGES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .filter((locale) => locale !== BASE_LOCALE);

let hasIssues = false;

for (const locale of locales) {
    const keys = new Set(collectKeys(loadMessages(locale)));
    const missing = [...baseKeys].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !baseKeys.has(k));

    if (missing.length === 0 && extra.length === 0) {
        console.log(`✓ ${locale}: in sync (${keys.size} keys)`);
        continue;
    }

    hasIssues = true;
    console.log(`✗ ${locale}: ${keys.size}/${baseKeys.size} keys`);
    if (missing.length > 0) {
        console.log(`  missing (${missing.length}):`);
        missing.forEach((k) => console.log(`    - ${k}`));
    }
    if (extra.length > 0) {
        console.log(`  extra (${extra.length}, not in en.json):`);
        extra.forEach((k) => console.log(`    + ${k}`));
    }
}

if (hasIssues) {
    process.exit(1);
} else {
    console.log('\nAll locales are in sync with en.json.');
}
