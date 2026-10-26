'use client'
import {useTranslations} from 'next-intl';
import {ComponentProps, Dispatch, ReactElement, SetStateAction, useEffect, useState} from 'react';
import dayjs, { Dayjs } from "lib/dayjs";
import {useDebounced} from "lib/hooks/useDebounced";
import {DateSources, useDateState} from './DateStateManager';
import { TrendingUp, Calendar as CalendarIcon, Users, Circle } from 'lucide-react';
import { Button } from "components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "components/ui/popover";
import { Calendar } from "components/ui/calendar";
import { cn } from "components/lib/utils";
import {withErrorCatch} from "components/common/withErrorCatch";

const MAX_RANGE_YEARS = 1;

const withTime = (date: Dayjs, time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return date.hour(hours).minute(minutes);
};

function SmallDatePicker({ value, onChange, label, maxDateTime, minDateTime }: {
    value: Dayjs,
    onChange: (date: Dayjs) => void,
    label: string,
    maxDateTime?: Dayjs,
    minDateTime?: Dayjs,
}) {
    const t = useTranslations('servers.toolbar');
    const [isOpen, setIsOpen] = useState(false);
    const [timeValue, setTimeValue] = useState(value.format('HH:mm'));

    useEffect(() => {
        setTimeValue(value.format('HH:mm'));
    }, [value]);

    return (
        <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">{label}</label>
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal text-xs h-8 px-2">
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {value.format('ll HH:mm')}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="single"
                        selected={value.toDate()}
                        defaultMonth={value.toDate()}
                        onSelect={date => date && onChange(withTime(dayjs(date), timeValue))}
                        disabled={date => dayjs(date).isAfter(dayjs())
                            || (maxDateTime && dayjs(date).isAfter(maxDateTime))
                            || (minDateTime && dayjs(date).isBefore(minDateTime, 'day'))}
                        initialFocus
                    />
                    <div className="p-3 border-t">
                        <label className="text-xs font-medium mb-1 block">{t('time')}</label>
                        <input
                            type="time"
                            value={timeValue}
                            onChange={e => {
                                setTimeValue(e.target.value);
                                onChange(withTime(value, e.target.value));
                            }}
                            className="w-full px-2 py-1 text-sm border rounded"
                        />
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}

function ToolbarButton({ tip, className, ...props }: ComponentProps<typeof Button> & { tip: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button size="icon" className={cn("h-8 w-8", className)} {...props} />
            </TooltipTrigger>
            <TooltipContent>
                <p>{tip}</p>
            </TooltipContent>
        </Tooltip>
    );
}

function GraphToolbarControl({ setShowPlayersAction }: { setShowPlayersAction: Dispatch<SetStateAction<boolean>>}): ReactElement {
    const t = useTranslations('servers.toolbar');
    const { start: globalStart, end: globalEnd, setDates, source: lastSource, timestamp, isLive, goLive } = useDateState();

    const [localStart, setLocalStart] = useState(globalStart);
    const [localEnd, setLocalEnd] = useState(globalEnd);

    useEffect(() => {
        if (lastSource !== DateSources.TOOLBAR) {
            setLocalStart(globalStart);
            setLocalEnd(globalEnd);
        }
    }, [globalStart, globalEnd, lastSource, timestamp]);

    // The apply button waits for the picked range to settle, and hides as soon as it is applied.
    const changed = localStart.isBefore(localEnd) && !(localStart.isSame(globalStart) && localEnd.isSame(globalEnd));
    const picked = `${localStart.valueOf()}-${localEnd.valueOf()}`;
    const settled = useDebounced(picked, 1000) === picked;
    const showApply = changed && settled;

    const handleStartChange = (value: Dayjs) => {
        setLocalStart(value);
        const latestEnd = value.add(MAX_RANGE_YEARS, 'year');
        if (localEnd.isAfter(latestEnd)) setLocalEnd(latestEnd);
    };

    const handleEndChange = (value: Dayjs) => {
        setLocalEnd(value);
        const earliestStart = value.subtract(MAX_RANGE_YEARS, 'year');
        if (localStart.isBefore(earliestStart)) setLocalStart(earliestStart);
    };

    return (
        <div className="p-4">
            <div className="flex gap-4 justify-between">
                <div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                        <SmallDatePicker
                            value={localStart}
                            onChange={handleStartChange}
                            label={t('start')}
                            maxDateTime={localEnd}
                        />
                        <span className="hidden sm:inline-block text-2xl mx-3">-</span>
                        <SmallDatePicker
                            label={t('end')}
                            value={localEnd}
                            onChange={handleEndChange}
                            minDateTime={localStart}
                        />
                    </div>
                </div>

                <div className="flex sm:flex-row flex-col gap-2">
                    {showApply && (
                        <ToolbarButton tip={t('selectDate')} onClick={() => setDates(localStart, localEnd, DateSources.TOOLBAR)}>
                            <TrendingUp className="h-4 w-4" />
                        </ToolbarButton>
                    )}
                    <ToolbarButton
                        tip={isLive ? t('exitLive') : t('switchLive')}
                        onClick={goLive}
                        variant={isLive ? "default" : "outline"}
                        className="relative"
                    >
                        <Circle className={cn("h-4 w-4", isLive && "fill-current")} />
                        {isLive && (
                            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                        )}
                    </ToolbarButton>
                    <ToolbarButton tip={t('showPlayers')} onClick={() => setShowPlayersAction(e => !e)}>
                        <Users className="h-4 w-4" />
                    </ToolbarButton>
                </div>
            </div>
        </div>
    );
}

export default withErrorCatch(GraphToolbarControl, t => t('servers.toolbar.loadError'))
