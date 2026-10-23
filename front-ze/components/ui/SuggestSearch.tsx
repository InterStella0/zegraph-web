'use client'
// Apart from SearchField so plain search boxes don't load the popover and command-list code.
import {KeyboardEvent, ReactNode, useEffect, useRef, useState} from "react";
import {Popover, PopoverContent, PopoverTrigger} from "components/ui/popover";
import {Command, CommandEmpty, CommandGroup, CommandItem, CommandList} from "components/ui/command";
import {SearchBox} from "components/ui/SearchField";
import {cn} from "components/lib/utils";

type SuggestOptions<T> = {
    fetch: (query: string, signal: AbortSignal) => Promise<T[]>,
    /** The search term an input commits to; an empty term clears the search at once. */
    toTerm?: (input: string) => string,
    minChars?: number,
    suggestDelay?: number,
    commitDelay?: number,
    onCommit?: (term: string) => void,
}

/**
 * Search input state: suggestions load shortly after typing stops, and the typed text is committed
 * as the search term after a longer pause, or at once on Enter or on picking a suggestion.
 */
export function useSuggestSearch<T>({
    fetch, toTerm = value => value.trim(), minChars = 3, suggestDelay = 300, commitDelay = 3000, onCommit,
}: SuggestOptions<T>) {
    const [input, setInput] = useState('')
    const [term, setTerm] = useState('')
    const [suggestions, setSuggestions] = useState<T[]>([])
    const [loading, setLoading] = useState(false)
    const latest = useRef({fetch, toTerm, onCommit})
    latest.current = {fetch, toTerm, onCommit}

    const commit = (value: string) => {
        const next = latest.current.toTerm(value)
        setTerm(next)
        latest.current.onCommit?.(next)
    }

    useEffect(() => {
        if (!latest.current.toTerm(input)) {
            commit(input)
            return
        }
        const timer = setTimeout(() => commit(input), commitDelay)
        return () => clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [input])

    useEffect(() => {
        const query = input.trim()
        if (query.length < minChars) {
            setSuggestions([])
            setLoading(false)
            return
        }
        const controller = new AbortController()
        const timer = setTimeout(() => {
            setLoading(true)
            latest.current.fetch(query, controller.signal)
                .catch(error => {
                    if (!controller.signal.aborted) console.error('Failed to load search suggestions:', error)
                    return []
                })
                .then(found => {
                    if (controller.signal.aborted) return
                    setSuggestions(found ?? [])
                    setLoading(false)
                })
        }, suggestDelay)
        return () => {
            clearTimeout(timer)
            controller.abort()
        }
    }, [input, minChars, suggestDelay])

    const reset = () => {
        setInput('')
        setTerm('')
        setSuggestions([])
    }

    return {input, setInput, term, commit, suggestions, loading, minChars, reset}
}

export type SuggestSearchState<T> = ReturnType<typeof useSuggestSearch<T>>

/** The input for useSuggestSearch, with a keyboard-navigable suggestion list. */
export function SuggestSearch<T>({search, itemValue, itemKey = itemValue, renderItem, format, placeholder, empty, className, openWhileLoading = true}: {
    search: SuggestSearchState<T>,
    itemValue: (item: T) => string,
    itemKey?: (item: T) => string,
    renderItem?: (item: T) => ReactNode,
    /** Rewrites what is typed before it reaches the input. */
    format?: (value: string) => string,
    placeholder: string,
    empty: ReactNode,
    className?: string,
    /** Open the list (showing `empty`) while suggestions load, rather than only once there are some. */
    openWhileLoading?: boolean,
}) {
    const {input, setInput, commit, suggestions, loading, minChars} = search
    const [open, setOpen] = useState(false)
    const [selected, setSelected] = useState(-1)
    const isOpen = open && ((openWhileLoading && loading) || suggestions.length > 0)
    const canOpen = (value: string) => value.trim().length >= minChars

    const choose = (value: string) => {
        setInput(value)
        commit(value)
        setOpen(false)
        setSelected(-1)
    }

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        const last = suggestions.length - 1
        if (isOpen && last >= 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            setSelected(i => event.key === 'ArrowDown' ? (i < last ? i + 1 : 0) : (i > 0 ? i - 1 : last))
        } else if (event.key === 'Enter') {
            choose(isOpen && suggestions[selected] ? itemValue(suggestions[selected]) : input)
        }
    }

    return (
        <Popover open={isOpen} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div className={cn("relative", className)}>
                    <SearchBox
                        value={input}
                        placeholder={placeholder}
                        loading={loading}
                        onChange={event => {
                            const value = format ? format(event.target.value) : event.target.value
                            setInput(value)
                            setSelected(-1)
                            setOpen(canOpen(value))
                        }}
                        onKeyDown={onKeyDown}
                        onFocus={() => canOpen(input) && setOpen(true)}
                    />
                </div>
            </PopoverTrigger>
            <PopoverContent
                className="p-0"
                align="start"
                style={{width: 'var(--radix-popover-trigger-width)'}}
                onOpenAutoFocus={event => event.preventDefault()}
            >
                <Command shouldFilter={false}>
                    <CommandList>
                        <CommandEmpty>{empty}</CommandEmpty>
                        <CommandGroup>
                            {suggestions.map((item, index) => (
                                <CommandItem
                                    key={itemKey(item)}
                                    value={itemValue(item)}
                                    data-selected={index === selected}
                                    onSelect={() => choose(itemValue(item))}
                                >
                                    {renderItem ? renderItem(item) : <span className="font-medium">{itemValue(item)}</span>}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
