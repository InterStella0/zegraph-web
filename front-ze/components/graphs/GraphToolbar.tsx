'use client'
import {useTranslations} from 'next-intl';
import {Dispatch, ReactElement, SetStateAction, useEffect, useRef, useState} from 'react';
import dayjs, { Dayjs } from 'dayjs';
import LocalizedFormat from 'dayjs/plugin/localizedFormat';
import {debounce} from 'utils/generalUtils';
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {DateSources, useDateState} from './DateStateManager';
import { TrendingUp, Calendar as CalendarIcon, Users, Circle } from 'lucide-react';
import { Button } from "components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "components/ui/popover";
import { Calendar } from "components/ui/calendar";
import { cn } from "components/lib/utils";

dayjs.extend(LocalizedFormat);

interface DateTimePickerProps {
    value: Dayjs;
    onChange: (date: Dayjs) => void;
    label: string;
    disableFuture?: boolean;
    maxDateTime?: Dayjs | null;
    minDateTime?: Dayjs | null;
}

function SmallDatePicker({ value, onChange, label, disableFuture, maxDateTime, minDateTime }: DateTimePickerProps) {
    const t = useTranslations('servers.toolbar');
    const [isOpen, setIsOpen] = useState(false);
    const [timeValue, setTimeValue] = useState(value.format('HH:mm'));

    useEffect(() => {
        setTimeValue(value.format('HH:mm'));
    }, [value]);

    const handleDateSelect = (date: Date | undefined) => {
        if (date) {
            const [hours, minutes] = timeValue.split(':').map(Number);
            const newDate = dayjs(date).hour(hours).minute(minutes);
            onChange(newDate);
        }
    };

    const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTime = e.target.value;
        setTimeValue(newTime);
        const [hours, minutes] = newTime.split(':').map(Number);
        const newDate = value.hour(hours).minute(minutes);
        onChange(newDate);
    };

    const displayValue = `${value.format('ll')} ${value.format('HH:mm')}`;

    return (
        <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">{label}</label>
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className={cn(
                            "justify-start text-left font-normal text-xs h-8 px-2",
                            !value && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {displayValue}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="single"
                        selected={value.toDate()}
                        onSelect={handleDateSelect}
                        disabled={(date) => {
                            if (disableFuture && dayjs(date).isAfter(dayjs())) return true;
                            if (maxDateTime && dayjs(date).isAfter(maxDateTime)) return true;
                            if (minDateTime && dayjs(date).isBefore(minDateTime)) return true;
                            return false;
                        }}
                        initialFocus
                    />
                    <div className="p-3 border-t">
                        <label className="text-xs font-medium mb-1 block">{t('time')}</label>
                        <input
                            type="time"
                            value={timeValue}
                            onChange={handleTimeChange}
                            className="w-full px-2 py-1 text-sm border rounded"
                        />
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}

function GraphToolbarControl({ setShowPlayersAction }: { setShowPlayersAction: Dispatch<SetStateAction<boolean>>}): ReactElement {
    const t = useTranslations('servers.toolbar');
    const { start: globalStart, end: globalEnd, setDates, source: lastSource, timestamp, isLive, goLive } = useDateState();

    const [localStart, setLocalStart] = useState(globalStart);
    const [localEnd, setLocalEnd] = useState(globalEnd);
    const [showApply, setShowApply] = useState(false);
    const debouncedShowApplyRef = useRef<DebouncedFunction<(shouldShow: boolean) => void> | null>();

    useEffect(() => {
        if (lastSource !== DateSources.TOOLBAR) {
            setLocalStart(globalStart);
            setLocalEnd(globalEnd);
            setShowApply(false);
        }
    }, [globalStart, globalEnd, lastSource, timestamp]);

    useEffect(() => {
        debouncedShowApplyRef.current = debounce((shouldShow) => {
            setShowApply(shouldShow);
        }, 1000, false);

        return () => {
            debouncedShowApplyRef.current?.cancel();
        };
    }, []);

    // Check if apply button should show
    useEffect(() => {
        const shouldShow = localStart.isBefore(localEnd) &&
            !(localStart.isSame(globalStart) && localEnd.isSame(globalEnd));
        debouncedShowApplyRef.current?.(shouldShow);
    }, [localStart, localEnd, globalStart, globalEnd]);

    const handleApply = () => {
        setDates(localStart, localEnd, DateSources.TOOLBAR);
        setShowApply(false);
    };

    const handleGoLive = () => {
        goLive();
        setShowApply(false);
    };

    return (
        <TooltipProvider>
            <div className="p-4">
                <div className="flex gap-4 justify-between">
                    <div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                            <SmallDatePicker
                                value={localStart}
                                onChange={(value) => setLocalStart(dayjs(value))}
                                label={t('start')}
                                disableFuture
                                maxDateTime={localEnd ?? null}
                            />
                            <span className="hidden sm:inline-block text-2xl mx-3">-</span>
                            <SmallDatePicker
                                label={t('end')}
                                value={localEnd}
                                onChange={(value) => setLocalEnd(dayjs(value))}
                                disableFuture
                                minDateTime={localStart ?? null}
                            />
                        </div>
                    </div>

                    <div className="flex sm:flex-row flex-col gap-2">
                        {showApply && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        onClick={handleApply}
                                        size="icon"
                                        className="h-8 w-8"
                                    >
                                        <TrendingUp className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{t('selectDate')}</p>
                                </TooltipContent>
                            </Tooltip>
                        )}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    onClick={handleGoLive}
                                    size="icon"
                                    variant={isLive ? "default" : "outline"}
                                    className="h-8 w-8 relative"
                                >
                                    <Circle className={cn("h-4 w-4", isLive && "fill-current")} />
                                    {isLive && (
                                        <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{isLive ? t('exitLive') : t('switchLive')}</p>
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    onClick={() => setShowPlayersAction((e: boolean) => !e)}
                                    size="icon"
                                    className="h-8 w-8"
                                >
                                    <Users className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{t('showPlayers')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}


export default function GraphToolbar({ setShowPlayersAction }: { setShowPlayersAction: Dispatch<boolean>}): ReactElement {
    const t = useTranslations('servers.toolbar');
    return (
        <ErrorCatch message={t('loadError')}>
            <GraphToolbarControl setShowPlayersAction={setShowPlayersAction} />
        </ErrorCatch>
    );
}