import { enUS, es, ms, zhCN, zhTW, ko, ja, ru, vi, id, type Locale } from 'date-fns/locale';
import { AppLocale } from 'i18n/config';

export const DATE_FNS_LOCALE: Record<AppLocale, Locale> = {
    'en': enUS, es, ms, 'zh-CN': zhCN, 'zh-TW': zhTW, ko, ja, ru, vi, id,
};
