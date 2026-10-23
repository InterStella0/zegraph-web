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

type ProfileCardProps = { className?: string, contentClassName?: string, children: ReactNode };

/** The frosted card every profile section sits in. */
export function ProfileCard({ className, contentClassName, children }: ProfileCardProps) {
    return (
        <Card className={cn("border-border/40 bg-card/50 backdrop-blur-xl", className)}>
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
            <div className={groupClassName}>
                <h2 className={HEADING}>{title}</h2>
                {badge ? <Badge variant="secondary" className="text-xs">{badge}</Badge> : null}
                {children}
            </div>
            {actions}
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
                {title ? <h2 className={HEADING}>{title}</h2> : <Skeleton className={cn("h-7", titleWidth)} />}
                {controlSize && <Skeleton className={controlSize} />}
            </div>
            {children}
        </ProfileCard>
    );
}

export function Empty({ className, children }: { className: string, children: ReactNode }) {
    return <div className={cn("flex items-center justify-center text-muted-foreground", className)}>{children}</div>;
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
            <div className={className} role="img" aria-label={label} aria-describedby={id}>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
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
