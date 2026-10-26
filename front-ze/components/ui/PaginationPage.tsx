"use client";

import {
    Pagination,
    PaginationItem,
    PaginationPrevious,
    PaginationNext, PaginationContent, PaginationFirst, PaginationLink, PaginationLast,
} from "components/ui/pagination";
import { Dispatch } from "react";
import { range } from "utils/generalUtils";

interface PaginationPageProps {
    totalPages: number;
    page: number;
    setPage: Dispatch<number>;
    compact?: boolean;
}

const edgeClass = (disabled: boolean) => disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer';

export default function PaginationPage({ totalPages, page, setPage, compact = false }: PaginationPageProps) {
    const atStart = page === 0;
    const atEnd = page >= totalPages - 1;
    // Up to three page numbers, centred on the current page where there is room.
    const firstShown = Math.max(0, Math.min(page - 1, totalPages - 3));
    const pageNums = compact ? [page] : range(Math.min(3, totalPages)).map(i => firstShown + i);
    return (
        <Pagination>
            <PaginationContent>
                {!compact && (
                    <PaginationItem>
                        <PaginationFirst onClick={() => setPage(0)} className={edgeClass(atStart)} />
                    </PaginationItem>
                )}
                <PaginationItem>
                    <PaginationPrevious onClick={() => page > 0 && setPage(page - 1)} className={edgeClass(atStart)} />
                </PaginationItem>
                <div className="flex gap-1">
                    {pageNums.map(pageNum => (
                        <PaginationItem key={pageNum}>
                            <PaginationLink
                                onClick={() => setPage(pageNum)}
                                isActive={page === pageNum}
                                className="cursor-pointer w-auto! min-w-9 px-2"
                            >
                                {pageNum + 1}
                            </PaginationLink>
                        </PaginationItem>
                    ))}
                </div>
                <PaginationItem>
                    <PaginationNext onClick={() => page < totalPages - 1 && setPage(page + 1)} className={edgeClass(atEnd)} />
                </PaginationItem>
                {!compact && (
                    <PaginationItem>
                        <PaginationLast onClick={() => setPage(totalPages - 1)} className={edgeClass(atEnd)} />
                    </PaginationItem>
                )}
            </PaginationContent>
        </Pagination>
    );
}
