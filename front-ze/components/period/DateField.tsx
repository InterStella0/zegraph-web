'use client'
import {useState} from "react";
import {CalendarIcon} from "lucide-react";
import {Button} from "components/ui/button";
import {Calendar} from "components/ui/calendar";
import {Input} from "components/ui/input";
import {Popover, PopoverContent, PopoverTrigger} from "components/ui/popover";
import {cn} from "components/lib/utils";

function toLocalDay(utc: Date): Date {
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

function toUtcDay(local: Date): Date {
    return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}

export default function DateField({
    label, value, min, max, invalid, highlighted, pickLabel, onChange, onPick, onBlur,
}: {
    label: string,
    value: string,
    min: Date | null,
    max: Date,
    invalid: boolean,
    highlighted: boolean,
    pickLabel: string,
    onChange: (value: string) => void,
    onPick: (day: Date) => void,
    onBlur: () => void,
}) {
    const [open, setOpen] = useState(false);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const selected = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;

    return (
        <div className="relative">
            <Input
                className={cn("h-10 pr-10 tabular-nums", highlighted && "border-primary")}
                aria-label={label}
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                maxLength={10}
                value={value}
                aria-invalid={invalid}
                onChange={e => onChange(e.target.value)}
                onBlur={onBlur}
            />
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-1/2 right-1 size-8 -translate-y-1/2"
                        aria-label={pickLabel}
                    >
                        <CalendarIcon className="size-4" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto overflow-hidden p-0" align="end">
                    <Calendar
                        mode="single"
                        captionLayout="dropdown"
                        selected={selected}
                        defaultMonth={selected ?? toLocalDay(max)}
                        startMonth={min ? toLocalDay(min) : undefined}
                        endMonth={toLocalDay(max)}
                        disabled={[
                            ...(min ? [{ before: toLocalDay(min) }] : []),
                            { after: toLocalDay(max) },
                        ]}
                        onSelect={day => {
                            if (!day) return;
                            onPick(toUtcDay(day));
                            setOpen(false);
                        }}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}
