import {useState, useEffect, useRef, useCallback, createContext, useContext, SetStateAction, Dispatch, ComponentProps, ReactNode} from 'react';
import dayjs, {Dayjs, ManipulateType} from "lib/dayjs";
import { Button } from "components/ui/button";
import { Slider } from "components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/ui/select";
import { Play, Pause, Circle, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "components/lib/utils";
import {getIntervalCallback} from "utils/generalUtils.ts";
import {useTranslations} from 'next-intl';
import {wmsTimeRange} from "./RadarPreview.tsx";

const INTERVALS = ['10min', '30min', '1hour', '6hours', '12hours', '1day', '1week', '1month'] as const;
type TimeIntervals = typeof INTERVALS[number]
export type TemporalData = { cursor: Dayjs, interval: TimeIntervals, isLive: boolean}
export const TemporalContext = createContext<{ data: TemporalData | null, set: Dispatch<SetStateAction<TemporalData>> }>({ data: null, set: () => {}})

// How far an interval steps, and how far back the range of the same name reaches.
const SPANS: Record<string, [number, ManipulateType]> = {
    '10min': [10, 'minute'], '30min': [30, 'minute'], '1hour': [1, 'hour'], '6hours': [6, 'hour'], '12hours': [12, 'hour'],
    '1day': [1, 'day'], '1week': [1, 'week'], '1month': [1, 'month'], '1year': [1, 'year'],
};
const intervalSpan = (interval: string) => SPANS[interval] ?? [1, 'hour'] as const;
// The slider step length of each unit; a month counts as 30 days.
const MINUTE_MS = 60 * 1000;
const UNIT_MS: Partial<Record<ManipulateType, number>> = {
    minute: MINUTE_MS, hour: 60 * MINUTE_MS, day: 24 * 60 * MINUTE_MS, week: 7 * 24 * 60 * MINUTE_MS, month: 30 * 24 * 60 * MINUTE_MS,
};
// The range options in display order, with the intervals each one offers.
const RANGE_INTERVALS: Record<string, readonly TimeIntervals[]> = {
    'all': INTERVALS,
    '1year': INTERVALS,
    '1month': INTERVALS.slice(0, -1),
    '1week': ['1hour', '6hours', '12hours', '1day'],
    '1day': ['10min', '30min', '1hour', '6hours'],
    '12hours': ['10min', '30min', '1hour'],
    '6hours': ['10min', '30min', '1hour'],
};

const formatDateDisplay = (date: Dayjs) => date.format('YYYY-MM-DD HH:mm:ss');

function TipButton({ tip, ...props }: ComponentProps<typeof Button> & { tip: ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" {...props} />
            </TooltipTrigger>
            <TooltipContent className="z-1000">{tip}</TooltipContent>
        </Tooltip>
    );
}

function LabeledSelect({ label, value, onValueChange, options, disabled }: {
    label: string, value: string, onValueChange: (value: string) => void, options: { label: string, value: string }[], disabled?: boolean,
}) {
    return (
        <div className="flex-none">
            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {label}
                </span>
                <Select disabled={disabled} value={value} onValueChange={onValueChange}>
                    <SelectTrigger size="sm" className="h-7 min-w-[80px] text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-5000">
                        {options.map(option => (
                            <SelectItem key={option.value} value={option.value} className="text-xs">
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

export default function TemporalController({ wmsLayerRef, initialStartDate, initialEndDate }) {
    const t = useTranslations('radar.temporal');
    const rangeOptions = Object.keys(RANGE_INTERVALS).map(value => ({ label: t(value === 'all' ? 'rangeAll' : `range${value}`), value }));

    const [startDate, setStartDate] = useState(initialStartDate);
    const [endDate, setEndDate] = useState(initialEndDate);
    const { data: { cursor: currentTime }, set: timeContextSet } = useContext(TemporalContext)
    const setCurrentTime = time => timeContextSet(prop => {
        prop.cursor = typeof time === 'function' ? time(prop.cursor) : time;
        return { ...prop };
    });
    const [sliderValue, setSliderValue] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [selectedInterval, setSelectedInterval] = useState<TimeIntervals>('10min');
    const [selectedRange, setSelectedRange] = useState('1month');
    const [isLive, setIsLive] = useState(true);
    const availableIntervals = RANGE_INTERVALS[selectedRange].map(value => ({ label: t(`interval${value}`), value }));

    const liveUpdateTimerRef = useRef(null)
    const debounceTimer = useRef(null)
    useEffect(() => {
        timeContextSet(prop => ({...prop, isLive }))
    }, [isLive, timeContextSet])

    const getTimeIncrement = useCallback(getIntervalCallback(selectedInterval), [selectedInterval])
    const [stepAmount, stepUnit] = intervalSpan(selectedInterval);
    const stepSizePercent = (stepAmount * UNIT_MS[stepUnit] / endDate.diff(startDate)) * 100;
    const percentOf = (time: Dayjs) => Math.min(100, (time.diff(startDate) / endDate.diff(startDate)) * 100);

    const updateWMSLayer = useCallback((start: Dayjs) => {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            const TIME = wmsTimeRange(start, getTimeIncrement(start));
            wmsLayerRef.current.forEach(ref => ref.setParams({ ...ref.options, TIME }));
        }, 120);
    }, [wmsLayerRef, getTimeIncrement]);

    useEffect(() => {
        updateWMSLayer(currentTime);
    }, [selectedInterval, updateWMSLayer, currentTime]);

    const setChangeInterval = (interval: TimeIntervals) => {
        setSelectedInterval(interval);
        timeContextSet(prop => {
            prop.interval = interval
            return {...prop}
        })
    }

    useEffect(() => () => clearTimeout(debounceTimer.current), []);

    const stopLive = () => {
        if (!isLive) return;
        setIsLive(false);
        clearInterval(liveUpdateTimerRef.current);
    };

    const handleSliderChange = (newValue: number) => {
        const roundedValue = Math.round(newValue / stepSizePercent) * stepSizePercent;
        setSliderValue(roundedValue);
        stopLive();
        const time = startDate.add(endDate.diff(startDate) * (roundedValue / 100), 'millisecond').second(0);
        setCurrentTime(time);
        updateWMSLayer(time);
    };

    const animate = () => {
        setCurrentTime(prevTime => {
            const nextTime = getTimeIncrement(prevTime);
            if (nextTime.isAfter(endDate)) {
                setIsPlaying(false);
                return prevTime;
            }
            setSliderValue(percentOf(nextTime));
            updateWMSLayer(nextTime);
            return nextTime;
        });
    };

    const updateToLive = () => {
        const now = dayjs();
        if (now.isAfter(endDate)) {
            setStartDate(now.subtract(endDate.diff(startDate), 'millisecond'));
            setEndDate(now);
        }
        setCurrentTime(now);
        setSliderValue(percentOf(now));
        updateWMSLayer(now);
    };

    const updateDateRange = (range: string) => {
        const now = dayjs();
        const newStartDate = range === 'all' ? dayjs(initialStartDate) : now.subtract(...SPANS[range]);
        setStartDate(newStartDate);
        setEndDate(now);
        setCurrentTime(currentTime < newStartDate ? newStartDate : currentTime.add(0, 'ms'))
    };

    const handleRangeChange = (range: string) => {
        setSelectedRange(range);
        updateDateRange(range);
        const intervals = RANGE_INTERVALS[range];
        if (!intervals.includes(selectedInterval)) {
            setChangeInterval(intervals[0]);
        }
    };

    useEffect(() => {
        if (!isPlaying) return;
        stopLive();
        const timer = setInterval(animate, 1000);
        return () => clearInterval(timer);
    }, [isPlaying]);

    useEffect(() => {
        if (!isLive) return;
        updateToLive();
        liveUpdateTimerRef.current = setInterval(updateToLive, 60000);
        return () => clearInterval(liveUpdateTimerRef.current);
    }, [isLive]);

    useEffect(() => {
        if (isLive)
            updateWMSLayer(currentTime);
    }, [startDate, endDate]);

    useEffect(() => {
        setSliderValue(percentOf(currentTime));
    }, [currentTime]);

    useEffect(() => {
        updateDateRange(selectedRange)
    }, []);

    const handleIntervalChange = (interval: TimeIntervals) => {
        setChangeInterval(interval);
        updateWMSLayer(currentTime);
    };

    // The step buttons are disabled while playing, so stepping only has to leave live mode.
    const stepTo = (time: Dayjs) => {
        stopLive();
        setCurrentTime(time);
        updateWMSLayer(time);
    };

    const toggleLiveMode = () => {
        setIsLive(!isLive);
        if (!isLive) {
            setChangeInterval('10min');
            setIsPlaying(false);
        }
    };
    return (
        <div
            className={cn(
                "absolute bottom-5 left-1/2 -translate-x-1/2",
                "z-[1000] w-[80vw] mx-3",
                "bg-background/80 dark:bg-background/70 backdrop-blur-md",
                "border border-border/40 rounded-xl shadow-lg",
                "p-2.5 cursor-default"
            )}
        >
            <div className="flex flex-col md:flex-row items-center gap-2 flex-wrap">
                <div className="flex-none">
                    <div className="flex items-center gap-1">
                        <TipButton
                            tip={t('stepBackward')}
                            onClick={() => {
                                const prevTime = currentTime.subtract(...intervalSpan(selectedInterval));
                                stepTo(prevTime.isBefore(startDate) ? startDate : prevTime);
                            }}
                            disabled={currentTime?.isSame(startDate) || isPlaying}
                            className="bg-accent/50 hover:bg-accent disabled:opacity-50"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </TipButton>

                        <TipButton
                            tip={isPlaying ? t('pause') : t('play')}
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="bg-accent/50 hover:bg-accent"
                        >
                            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </TipButton>

                        <TipButton
                            tip={t('stepForward')}
                            onClick={() => {
                                const nextTime = getTimeIncrement(currentTime);
                                stepTo(nextTime.isAfter(endDate) ? endDate : nextTime);
                            }}
                            disabled={currentTime?.isSame(endDate) || isPlaying}
                            className="bg-accent/50 hover:bg-accent disabled:opacity-50"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </TipButton>
                    </div>
                </div>

                <LabeledSelect label={t('range')} value={selectedRange} options={rangeOptions} onValueChange={handleRangeChange} />
                <LabeledSelect label={t('interval')} value={selectedInterval} options={availableIntervals} disabled={isLive}
                    onValueChange={handleIntervalChange} />

                <div className="flex-none">
                    <TipButton
                        tip={isLive ? t('exitLive') : t('switchLive')}
                        onClick={toggleLiveMode}
                        className={cn(
                            "relative",
                            isLive
                                ? "bg-destructive/10 hover:bg-destructive/20"
                                : "bg-accent/50 hover:bg-accent border border-primary"
                        )}
                    >
                        <div className={cn(
                            "absolute inset-0 flex items-center justify-center",
                            "text-[0.6rem] font-bold z-10",
                            isLive ? "text-transparent" : "text-primary"
                        )}>
                            LIVE
                        </div>
                        <Circle className={cn(
                            "h-4 w-4",
                            isLive ? "text-destructive animate-pulse z-20" : "text-transparent z-0"
                        )} />
                    </TipButton>
                </div>
                <div className="flex-1 w-full md:w-auto min-w-0 mt-2 md:mt-0">
                    <div className="relative h-[30px] w-full flex items-center mt-2">
                        <div className="absolute -top-[18px] left-1/2 -translate-x-1/2 text-xs font-bold text-center whitespace-nowrap">
                            {isLive
                                ? `LIVE: ${formatDateDisplay(currentTime)}`
                                : `${formatDateDisplay(currentTime)} - ${formatDateDisplay(getTimeIncrement(currentTime))}`}
                        </div>

                        <div className="absolute top-0 left-1 right-1 h-full flex justify-between pointer-events-none before:absolute before:top-[14px] before:left-0 before:right-0 before:h-0.5 before:bg-border before:z-0">
                            {[0, 4].map(mark => <div key={mark} className="w-px mt-2.5 relative z-10 h-2.5 bg-foreground" />)}
                        </div>

                        <div className="w-full z-10">
                            <Slider
                                value={[sliderValue]}
                                onValueChange={([value]) => handleSliderChange(value)}
                                min={0}
                                max={100}
                                step={stepSizePercent}
                                className="w-full"
                            />
                        </div>

                        <div className="absolute -bottom-[18px] left-0 right-0 flex justify-between px-0.5">
                            {[startDate, endDate].map((date, i) => (
                                <span key={i} className="text-[0.65rem] text-muted-foreground truncate">
                                    {formatDateDisplay(date)}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
