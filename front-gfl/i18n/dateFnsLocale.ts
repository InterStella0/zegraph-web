import { enUS, es, ms, zhCN, zhTW, ko, ja, ru, vi, id, type Locale } from 'date-fns/locale';
import { AppLocale } from 'i18n/config';

export const DATE_FNS_LOCALE: Record<AppLocale, Locale> = {
    'en': enUS,
    'es': es,
    'ms': ms,
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    'ko': ko,
    'ja': ja,
    'ru': ru,
    'vi': vi,
    'id': id,
};
