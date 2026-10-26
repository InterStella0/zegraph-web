import humanizeDuration from 'humanize-duration';

// humanize-duration names every app locale the same way, with an underscore (zh-CN → zh_CN).
export function humanizeDurationLocalized(ms: number, locale: string, options?: humanizeDuration.Options): string {
    return humanizeDuration(ms, {language: locale.replace('-', '_'), fallbacks: ['en'], ...options});
}
