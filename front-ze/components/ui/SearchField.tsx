'use client'
import {ComponentProps} from "react";
import {Loader2, Search} from "lucide-react";
import {Input} from "components/ui/input";
import {cn} from "components/lib/utils";

const ICON = "absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"

export function SearchBox({loading, ...props}: ComponentProps<typeof Input> & {loading?: boolean}) {
    return <>
        <Search className={cn(ICON, "left-3")} />
        <Input {...props} className={cn("pl-10", loading !== undefined && "pr-10")} />
        {loading && <Loader2 className={cn(ICON, "right-3 animate-spin")} />}
    </>
}

/** An input with a search icon, and a spinner on the right while `loading`. */
export function SearchField({className, ...props}: ComponentProps<typeof SearchBox>) {
    return <div className={cn("relative", className)}><SearchBox {...props} /></div>
}
