'use client'
import { useState } from "react";
import { Button } from "components/ui/button";
import { ChevronUp, ChevronDown } from "lucide-react";
import dayjs from "dayjs";

export default function PlayerAliasesButton({ aliases }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <>
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setExpanded(!expanded)}
                className="h-8 w-8 p-1 text-muted-foreground hover:bg-accent"
            >
                {expanded ? (
                    <ChevronUp className="h-4 w-4" />
                ) : (
                    <ChevronDown className="h-4 w-4" />
                )}
            </Button>
            {expanded && (
                <div className="absolute top-full left-0 z-10 mt-2 max-h-50 w-55 sm:w-62.5 overflow-y-auto bg-card card-solid border border-border rounded-lg shadow-lg">
                    <div className="divide-y divide-border">
                        {aliases.map((alias, i) => (
                            <div key={i} className="px-4 py-2">
                                <div className="text-sm font-normal">
                                    {alias.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {dayjs(alias.created_at).format("lll")}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}
