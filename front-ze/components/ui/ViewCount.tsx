'use client'
import {Suspense, use} from "react";
import {useLocale, useTranslations} from "next-intl";
import {Eye} from "lucide-react";
import {cn} from "components/lib/utils";

type ViewCountProps = {
    viewsPromise: Promise<number | null>,
    className?: string,
    iconClassName?: string,
}

function ViewCountDisplay({ viewsPromise, className, iconClassName }: ViewCountProps) {
    const t = useTranslations('common');
    const locale = useLocale();
    const views = use(viewsPromise)
    if (views == null) return null

    const formatted = new Intl.NumberFormat(locale, {notation: 'compact', maximumFractionDigits: 1}).format(views)
    return (
        <span title={t('viewsHint')} className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
            <Eye className={iconClassName} />
            {t('views', {count: views, views: formatted})}
        </span>
    )
}

export default function ViewCount(props: ViewCountProps) {
    return (
        <Suspense fallback={null}>
            <ViewCountDisplay {...props} />
        </Suspense>
    )
}
