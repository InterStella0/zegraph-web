'use client';

import { DependencyList, ReactNode, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "components/ui/card";
import { Badge } from "components/ui/badge";
import { Skeleton } from "components/ui/skeleton";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import PaginationPage from "components/ui/PaginationPage";
import { cn } from "components/lib/utils";

const HEADING = "text-xl font-semibold";
const ROWS_PER_PAGE = 10;

// Over a player's Steam background the card is one sheet of frosted glass. Hovering clears it to show
// the image, and everything with text or a chart then gets a backing of its own from the surface it
// sits on (see profile-frame and profile-surface in globals.css). Without a background these classes
// do nothing.
/** The frosted surface alone, for an element that already has its shape. */
export const SURFACE = "profile-bg:profile-surface";
/** A surface block around a chart, list or table. */
export const PANEL = `${SURFACE} profile-bg:rounded-lg profile-bg:p-3`;
/** A surface hugging a line of text. */
export const TAG = `${SURFACE} profile-bg:w-fit profile-bg:rounded-lg profile-bg:px-3 profile-bg:py-1.5`;
/** A surface tray around a group of controls. */
export const TRAY = `${SURFACE} profile-bg:rounded-lg profile-bg:p-1`;

type ProfileCardProps = { className?: string, contentClassName?: string, children: ReactNode };

/** The frosted card every profile section sits in; lighter glass over a Steam background. */
export function ProfileCard({ className, contentClassName, children }: ProfileCardProps) {
    return (
        <Card className={cn("border-border/40 bg-card/50 backdrop-blur-xl profile-bg:profile-frame", className)}>
            <CardContent className={cn("p-4 sm:p-6", contentClassName)}>{children}</CardContent>
        </Card>
    );
}

export function ProfileCardHeader({ title, badge, actions, className, groupClassName = "flex flex-wrap items-center gap-2", children }: {
    title: ReactNode,
    badge?: ReactNode,
    actions?: ReactNode,
    className?: string,
    groupClassName?: string,
    children?: ReactNode,
}) {
    return (
        <div className={cn("mb-4 flex flex-wrap items-center justify-between gap-3", className)}>
            <div className={cn(groupClassName, TAG)}>
                <h2 className={HEADING}>{title}</h2>
                {badge ? <Badge variant="secondary" className="text-xs">{badge}</Badge> : null}
                {children}
            </div>
            {actions ? <div className={TRAY}>{actions}</div> : null}
        </div>
    );
}

/** Placeholder card: the real title when it is static (else a bar `titleWidth` wide), an optional control bar, then the body. */
export function ProfileCardLoading({ title, titleWidth, controlSize, children, ...card }: ProfileCardProps & {
    title?: string,
    titleWidth?: string,
    controlSize?: string,
}) {
    return (
        <ProfileCard {...card}>
            <div className="mb-4 flex items-center justify-between gap-2">
                {title ? <h2 className={cn(HEADING, TAG)}>{title}</h2> : <Skeleton className={cn("h-7", titleWidth)} />}
                {controlSize && <Skeleton className={controlSize} />}
            </div>
            {children}
        </ProfileCard>
    );
}

export function Empty({ className, children }: { className: string, children: ReactNode }) {
    return <div className={cn("flex items-center justify-center text-muted-foreground profile-bg:rounded-lg", SURFACE, className)}>{children}</div>;
}

/** A chart exposed to screen readers as one image, described by a text summary. */
export function ChartFigure({ id, summary, label, className, children }: {
    id: string,
    summary: ReactNode,
    label: string,
    className: string,
    children: ReactNode,
}) {
    return (
        <>
            <ScreenReaderOnly id={id}>{summary}</ScreenReaderOnly>
            <div className={cn(PANEL, className)} role="img" aria-label={label} aria-describedby={id}>
                {children}
            </div>
        </>
    );
}

type Paged<T> = ReturnType<typeof usePaged<T>>;

/** Client-side pagination over `rows`, back to the first page whenever `resetDeps` change. */
export function usePaged<T>(rows: T[], resetDeps: DependencyList) {
    const [page, setPage] = useState(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => setPage(0), resetDeps);
    return {
        page,
        setPage,
        total: rows.length,
        totalPages: Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE)),
        pageRows: rows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE),
    };
}

export function PageFooter({ paged: { page, setPage, total, totalPages }, compact }: { paged: Paged<unknown>, compact?: boolean }) {
    const t = useTranslations('players.profile');
    return (
        <div className={cn("flex flex-wrap items-center justify-between gap-2 profile-bg:rounded-lg profile-bg:px-3 profile-bg:py-1.5", SURFACE)}>
            <span className="text-sm text-muted-foreground">
                {t('pageRange', {
                    from: total === 0 ? 0 : page * ROWS_PER_PAGE + 1,
                    to: Math.min((page + 1) * ROWS_PER_PAGE, total),
                    total,
                })}
            </span>
            {totalPages > 1 && (
                <div>
                    <PaginationPage totalPages={totalPages} page={page} setPage={setPage} compact={compact} />
                </div>
            )}
        </div>
    );
}
