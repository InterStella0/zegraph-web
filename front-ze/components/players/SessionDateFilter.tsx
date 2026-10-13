'use client'
import {useState} from "react";
import {useTranslations} from 'next-intl';
import dayjs from "dayjs";
import {Calendar as CalendarIcon, ChevronLeft, ChevronRight} from "lucide-react";
import {Button} from "components/ui/button";
import {Calendar} from "components/ui/calendar";
import {Popover, PopoverContent, PopoverTrigger} from "components/ui/popover";
import {cn} from "components/lib/utils";

export default function SessionDateFilter({ selectedDate, onSelectDate, firstDay, lastDay, compact = false }: {
    selectedDate: Date | undefined,
    onSelectDate: (date: Date | undefined) => void,
    firstDay?: Date,
    lastDay?: Date,
    compact?: boolean,
}) {
    const t = useTranslations('players.sessions');
    const [open, setOpen] = useState(false);
    const navClass = compact ? "h-8 w-8 shrink-0" : undefined;
    const label = selectedDate ? dayjs(selectedDate).format('MMM DD, YYYY') : t('filterByDate');
    const shift = (days: number) => {
        if (selectedDate) onSelectDate(dayjs(selectedDate).add(days, 'day').toDate());
    };

    return (
        <div className={compact ? "flex gap-1 items-center" : "flex gap-2 items-center"}>
            {selectedDate && (
                <Button
                    variant="ghost"
                    size="icon"
                    className={navClass}
                    onClick={() => shift(-1)}
                    disabled={!!firstDay && !dayjs(selectedDate).isAfter(firstDay, 'day')}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
            )}
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size={compact ? "sm" : undefined}
                        className={cn(
                            compact
                                ? "h-8 min-w-0 flex-1 justify-start text-left text-xs font-normal"
                                : "min-w-[140px] sm:min-w-[200px] justify-start text-left font-normal",
                            !selectedDate && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className={compact ? "mr-1.5 h-3.5 w-3.5 shrink-0" : "mr-2 h-4 w-4"} />
                        {compact ? <span className="truncate">{label}</span> : label}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={date => {
                            onSelectDate(date);
                            setOpen(false);
                        }}
                        {...(!compact && {
                            defaultMonth: selectedDate ?? firstDay,
                            startMonth: firstDay,
                            endMonth: lastDay,
                            disabled: firstDay ? [{ before: firstDay }, { after: lastDay }] : undefined,
                        })}
                    />
                </PopoverContent>
            </Popover>
            {selectedDate && (
                <Button
                    variant="ghost"
                    size="icon"
                    className={navClass}
                    onClick={() => shift(1)}
                    disabled={!!lastDay && !dayjs(selectedDate).isBefore(lastDay, 'day')}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            )}
            {selectedDate && (
                <Button
                    variant="ghost"
                    size="sm"
                    className={compact ? "h-8 shrink-0 px-2 text-xs" : undefined}
                    onClick={() => onSelectDate(undefined)}
                >
                    {t('clear')}
                </Button>
            )}
        </div>
    );
}
