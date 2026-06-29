"use client";

import {
    Pagination,
    PaginationItem,
    PaginationPrevious,
    PaginationNext, PaginationContent, PaginationFirst, PaginationLink, PaginationLast,
} from "components/ui/pagination";
import { Dispatch } from "react";

interface PaginationPageProps {
    totalPages: number;
    page: number;
    setPage: Dispatch<number>;
    compact?: boolean;
}

export default function PaginationPage({ totalPages, page, setPage, compact = false }: PaginationPageProps) {
    const pageDisplay = compact? 1: Math.min(3, totalPages);
    return (
        <Pagination>
            <PaginationContent>{!compact &&
                <PaginationItem>
                    <PaginationFirst
                        onClick={() => setPage(0)}
                        className={page === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                </PaginationItem>
            }
                <PaginationItem>
                    <PaginationPrevious
                        onClick={() => page > 0 && setPage(page - 1)}
                        className={page === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                </PaginationItem>
                <div className="flex gap-1">
                    {Array.from({ length: pageDisplay }, (_, i) => {
                        let pageNum: number;

                        if (compact) {
                            pageNum = page;
                        } else if (totalPages <= 3) {
                            pageNum = i;
                        } else if (page < 2) {
                            pageNum = i;
                        } else if (page >= totalPages - 2) {
                            pageNum = totalPages - 3 + i;
                        } else {
                            pageNum = page - 1 + i;
                        }
                        const currentPage = page === pageNum
                        return (
                            <PaginationItem key={pageNum}>
                                <PaginationLink
                                    onClick={() => setPage(pageNum)}
                                    isActive={currentPage}
                                    className="cursor-pointer w-auto! min-w-9 px-2"
                                >
                                    {pageNum + 1}
                                </PaginationLink>
                            </PaginationItem>
                        );
                    })}
                </div>

                <PaginationItem>
                    <PaginationNext
                        onClick={() => page < totalPages - 1 && setPage(page + 1)}
                        className={page >= totalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                </PaginationItem>
                {!compact &&
                    <PaginationItem>
                        <PaginationLast
                            onClick={() => setPage(totalPages - 1)}
                            className={page >= totalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                    </PaginationItem>
                }
            </PaginationContent>
        </Pagination>
    );
}
