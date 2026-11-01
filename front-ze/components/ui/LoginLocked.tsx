'use client'
import {ReactNode} from "react";
import {useTranslations} from "next-intl";
import {Lock} from "lucide-react";
import {Button} from "components/ui/button";
import {Card} from "components/ui/card";
import {cn} from "components/lib/utils";
import {useLoginDialog} from "components/ui/LoginDialog";
import {AuthenticationError} from "utils/generalUtils";

/** True when an error from a login-only route means "log in", e.g. an expired session. */
export const isLoginRequired = (error: unknown) => error instanceof AuthenticationError;

/**
 * Placeholder for data only shown to logged-in visitors. `bare` drops the card so it can sit
 * inside an existing card; `compact` is an inline badge for spots like a score cell.
 */
export default function LoginLocked({ title, className, bare = false, compact = false }: {
    title?: ReactNode, className?: string, bare?: boolean, compact?: boolean,
}) {
    const t = useTranslations('locked');
    const {openLogin, loginDialog} = useLoginDialog();

    if (compact) {
        return <>
            <button
                type="button"
                onClick={event => { event.preventDefault(); event.stopPropagation(); openLogin(); }}
                title={t('compact')}
                aria-label={t('compact')}
                className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors", className)}
            >
                <Lock className="h-3 w-3" />
            </button>
            {loginDialog}
        </>;
    }

    const body = <div className={cn("flex flex-col items-center justify-center gap-3 p-6 text-center min-h-[220px]", bare && className)}>
        <div className="rounded-full bg-muted p-3">
            <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        {title && <h2 className="text-lg font-semibold">{title}</h2>}
        <p className="text-sm text-muted-foreground max-w-sm">{t('description')}</p>
        <Button size="sm" onClick={openLogin}>{t('login')}</Button>
        {loginDialog}
    </div>;

    return bare ? body : <Card className={cn("h-full", className)}>{body}</Card>;
}
