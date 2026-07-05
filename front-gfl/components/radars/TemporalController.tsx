import {useState, useEffect, useRef, useCallback, createContext, useContext} from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { Button } from "components/ui/button";
import { Slider } from "components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/ui/select";
import { Play, Pause, Circle, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "components/lib/utils";
import {getIntervalCallback} from "utils/generalUtils.ts";
import {Dayjs} from "dayjs";
import {useTranslations} from 'next-intl';

// Extend dayjs with plugins
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localizedFormat);


export const formatDateWMS = (date) => {
    // My data is in +08 and QGIS Server decided that it doesnt care about timezone.
    // https://github.com/qgis/QGIS/issues/58034
    // return date.utc().tz('Asia/Kuala_Lumpur').format("YYYY-MM-DD HH:mm:ss");
    return date.toISOString()
};

export const TemporalContext = createContext({})

export default function TemporalController({ wmsLayerRef, initialStartDate, initialEndDate,
                                               intervals = null
                                           }){
    const t = useTranslations('radar.temporal');
    intervals = intervals ?? [
        { label: t('interval10min'), value: '10min' },
        { label: t('interval1hour'), value: '1hour' },
        { label: t('interval12hours'), value: '12hours' },
        { label: t('interval1day'), value: '1day' },
        { label: t('interval1month'), value: '1month' }
    ];
    const rangeOptions = [
        { label: t('rangeAll'), value: 'all' },
        { label: t('range1year'), value: '1year' },
        { label: t('range1month'), value: '1month' },
        { label: t('range1week'), value: '1week' },
        { label: t('range1day'), value: '1day' },
        { label: t('range12hours'), value: '12hours' },
        { label: t('range6hours'), value: '6hours' }
    ];

    const [startDate, setStartDate] = useState(initialStartDate);
    const [endDate, setEndDate] = useState(initialEndDate);
    const timeContext = useContext(TemporalContext)
    const currentTime = timeContext.data.cursor
    const timeContextSet = timeContext.set
    const setCurrentTime = time => {
        timeContextSet(prop => {
            const newTime = typeof time === 'function' ? time(prop.cursor) : time;
            prop.cursor = newTime;
            return { ...prop };
        });
    };
    const [sliderValue, setSliderValue] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [selectedInterval, setSelectedInterval] = useState('10min');
    const [selectedRange, setSelectedRange] = useState('1month');
    const [isLive, setIsLive] = useState(true);
    const [availableIntervals, setAvailableIntervals] = useState(intervals);

    const animationTimerRef = useRef(null)
    const liveUpdateTimerRef = useRef(null)
    const debounceTimer = useRef(null)
    useEffect(() => {
        timeContextSet(prop => ({...prop, isLive }))
    }, [isLive, timeContextSet])

    const getTimeIncrement = useCallback(getIntervalCallback(selectedInterval), [selectedInterval])
    const formatDateDisplay = (date) => {
        return date.format('YYYY-MM-DD HH:mm:ss');
    };

    const getStepSizePercent = () => {
        const totalRange = endDate.diff(startDate);

        const stepMap = {
            '10min': 10 * 60 * 1000,
            '30min': 30 * 60 * 1000,
            '1hour': 60 * 60 * 1000,
            '6hours': 6 * 60 * 60 * 1000,
            '12hours': 12 * 60 * 60 * 1000,
            '1day': 24 * 60 * 60 * 1000,
            '1week': 7 * 24 * 60 * 60 * 1000,
            '1month': 30 * 24 * 60 * 60 * 1000,
        };

        const stepMs = stepMap[selectedInterval] || 60 * 60 * 1000; // default to 1 hour

        return (stepMs / totalRange) * 100;
    };

    const rawUpdateWMSLayer = useCallback((start) => {
        if (!wmsLayerRef.current?.length) return;

        const startStr = formatDateWMS(start);
        const endStr = formatDateWMS(getTimeIncrement(start));
        wmsLayerRef.current.forEach(ref => {
            ref.setParams({
                ...ref.options,
                TIME: `${startStr}/${endStr}`,
            });
        });
    }, [wmsLayerRef, getTimeIncrement]);

    const updateWMSLayer = useCallback((start) => {
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }
        debounceTimer.current = setTimeout(() => {
            rawUpdateWMSLayer(start);
        }, 120);
    }, [rawUpdateWMSLayer]);

    useEffect(() => {
        if (selectedInterval != null) {
            updateWMSLayer(currentTime);
        }
    }, [selectedInterval, updateWMSLayer, currentTime]);
    const setChangeInterval = useCallback((state) => {
        setSelectedInterval(state);
        timeContextSet(props => {
            props.interval = state
            return {...props}
        })
    }, [timeContextSet])

    useEffect(() => {
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, []);

    const updateTimeFromSlider = (sliderPos) => {
        if (isLive) {
            setIsLive(false);
            clearInterval(liveUpdateTimerRef.current);
        }

        const totalDuration = endDate.diff(startDate);
        const currentOffset = totalDuration * (sliderPos / 100);
        const newTime = startDate.add(currentOffset, 'millisecond');
        const absoluteTime = newTime.second(0)
        setCurrentTime(absoluteTime);
        updateWMSLayer(absoluteTime);
    };

    const handleSliderChange = (newValue) => {
        const stepSize = getStepSizePercent();
        const roundedValue = Math.round(newValue / stepSize) * stepSize;

        setSliderValue(roundedValue);
        updateTimeFromSlider(roundedValue);
    };

    const animate = () => {
        setCurrentTime(prevTime => {
            const nextTime = getTimeIncrement(prevTime);

            if (nextTime.isAfter(endDate)) {
                setIsPlaying(false);
                return prevTime;
            }

            const totalTime = endDate.diff(startDate);
            const elapsedTime = nextTime.diff(startDate);
            const percentage = Math.min(100, (elapsedTime / totalTime) * 100);
            setSliderValue(percentage);

            updateWMSLayer(nextTime);
            return nextTime;
        });
    };

    const updateToLive = () => {
        const now = dayjs();

        if (now.isAfter(endDate)) {
            const range = endDate.diff(startDate);
            const newEnd = now;
            const newStart = now.subtract(range, 'millisecond');

            setStartDate(newStart);
            setEndDate(newEnd);
        }

        setCurrentTime(now);

        const totalTime = endDate.diff(startDate);
        const elapsedTime = now.diff(startDate);
        const percentage = Math.min(100, (elapsedTime / totalTime) * 100);
        setSliderValue(percentage);

        updateWMSLayer(now);
    };

    const updateDateRange = (rangeValue) => {
        const now = dayjs();
        let newStartDate;
        let newEndDate = now;

        switch(rangeValue) {
            case 'all':
                newStartDate = dayjs(initialStartDate);
                break;
            case '1year':
                newStartDate = now.subtract(1, 'year');
                break;
            case '1month':
                newStartDate = now.subtract(1, 'month');
                break;
            case '1week':
                newStartDate = now.subtract(1, 'week');
                break;
            case '1day':
                newStartDate = now.subtract(1, 'day');
                break;
            case '12hours':
                newStartDate = now.subtract(12, 'hour');
                break;
            case '6hours':
                newStartDate = now.subtract(6, 'hour');
                break;
            default:
                newStartDate = now.subtract(1, 'month'); // Default to 1 month
        }

        setStartDate(newStartDate);
        setEndDate(newEndDate);
        setCurrentTime(currentTime < newStartDate ? newStartDate : currentTime.add(0, 'ms'))
    };

    // Function to get appropriate interval options based on selected range
    const getIntervalOptionsForRange = (rangeValue) => {
        // Define which intervals are appropriate for each range
        const intervalMap = {
            'all': ['1month', '1week', '1day', '12hours', '6hours', '1hour', '30min', '10min'],
            '1year': ['1month', '1week', '1day', '12hours', '6hours', '1hour', '30min', '10min'],
            '1month': ['1week', '1day', '12hours', '6hours', '1hour', '30min', '10min'],
            '1week': ['1day', '12hours', '6hours', '1hour'],
            '1day': ['6hours', '1hour', '30min', '10min'],
            '12hours': ['1hour', '30min', '10min'],
            '6hours': ['1hour', '30min', '10min']
        };

        // Get list of valid interval values for this range
        const validIntervalValues = intervalMap[rangeValue] || ['1hour'];

        // Filter the full intervals array to only include valid ones
        return [
            { label: t('interval10min'), value: '10min' },
            { label: t('interval30min'), value: '30min' },
            { label: t('interval1hour'), value: '1hour' },
            { label: t('interval6hours'), value: '6hours' },
            { label: t('interval12hours'), value: '12hours' },
            { label: t('interval1day'), value: '1day' },
            { label: t('interval1week'), value: '1week' },
            { label: t('interval1month'), value: '1month' }
        ].filter(interval => validIntervalValues.includes(interval.value));
    };

    const handleRangeChange = (event) => {
        const newRange = event.target.value;
        setSelectedRange(newRange);
        updateDateRange(newRange);

        const newIntervals = getIntervalOptionsForRange(newRange);
        setAvailableIntervals(newIntervals);

        if (!newIntervals.some(interval => interval.value === selectedInterval)) {
            setChangeInterval(newIntervals[0].value);
        }
    };

    // Start/stop animation
    useEffect(() => {
        if (isPlaying) {
            if (isLive) {
                setIsLive(false);
                clearInterval(liveUpdateTimerRef.current);
            }

            animationTimerRef.current = setInterval(animate, 1000);
        } else {
            clearInterval(animationTimerRef.current);
        }

        return () => {
            clearInterval(animationTimerRef.current);
        };
    }, [isPlaying]);

    // Handle live mode
    useEffect(() => {
        if (isLive) {
            if (isPlaying) {
                setIsPlaying(false);
                clearInterval(animationTimerRef.current);
            }
            updateToLive();
            liveUpdateTimerRef.current = setInterval(updateToLive, 60000);
        } else {
            clearInterval(liveUpdateTimerRef.current);
        }

        return () => {
            clearInterval(liveUpdateTimerRef.current);
        };
    }, [isLive]);

    useEffect(() => {
        if (isLive)
            updateWMSLayer(currentTime);
    }, [startDate, endDate]);

    // Update slider position when current time changes
    useEffect(() => {
        const totalTime = endDate.diff(startDate);
        const elapsedTime = currentTime.diff(startDate);
        const percentage = Math.min(100, (elapsedTime / totalTime) * 100);
        setSliderValue(percentage);
    }, [currentTime]);

    // Initialize available intervals based on default range
    useEffect(() => {
        const initialIntervals = getIntervalOptionsForRange(selectedRange)
        setAvailableIntervals(initialIntervals)
        updateDateRange(initialIntervals)
    }, []);

    // Handle interval change
    const handleIntervalChange = (event) => {
        setChangeInterval(event.target.value);
        updateWMSLayer(currentTime);
    };

    // Toggle live mode - shows current time
    const toggleLiveMode = () => {
        setIsLive(!isLive);
        if (!isLive) {
            setChangeInterval('10min');
            if (isPlaying) {
                setIsPlaying(false);
            }
        }
    };
    return (
        <TooltipProvider delayDuration={200}>
        <div
            className={cn(
                "absolute bottom-5 left-1/2 -translate-x-1/2",
                "z-[1000] w-[80vw] mx-3",
                "bg-background/80 dark:bg-background/70 backdrop-blur-md",
                "border border-border/40 rounded-xl shadow-lg",
                "p-2.5 cursor-default",
                "slider-container"
            )}
        >
            <div className="flex flex-col md:flex-row items-center gap-2 flex-wrap">
                <div className="flex-none">
                    <div className="flex items-center gap-1">
                        {/* Step Backward Button */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => {
                                        if (isLive) {
                                            setIsLive(false);
                                            clearInterval(liveUpdateTimerRef.current);
                                        }

                                        if (isPlaying) {
                                            setIsPlaying(false);
                                        }

                                        const intervalMap = {
                                            '10min': { amount: 10, unit: 'minute' },
                                            '30min': { amount: 30, unit: 'minute' },
                                            '1hour': { amount: 1, unit: 'hour' },
                                            '6hours': { amount: 6, unit: 'hour' },
                                            '12hours': { amount: 12, unit: 'hour' },
                                            '1day': { amount: 1, unit: 'day' },
                                            '1week': { amount: 1, unit: 'week' },
                                            '1month': { amount: 1, unit: 'month' }
                                        };

                                        const { amount, unit } = intervalMap[selectedInterval] || { amount: 1, unit: 'hour' };
                                        const prevTime = currentTime.subtract(amount, unit);


                                        // Don't go before start date
                                        if (prevTime.isBefore(startDate)) {
                                            setCurrentTime(startDate);
                                            updateWMSLayer(startDate);
                                        } else {
                                            setCurrentTime(prevTime);
                                            updateWMSLayer(prevTime);
                                        }
                                    }}
                                    disabled={currentTime?.isSame(startDate) || isPlaying}
                                    className="bg-accent/50 hover:bg-accent disabled:opacity-50"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent className="z-1000">{t('stepBackward')}</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setIsPlaying(!isPlaying)}
                                    className="bg-accent/50 hover:bg-accent"
                                >
                                    {isPlaying ?
                                        <Pause className="h-4 w-4" /> :
                                        <Play className="h-4 w-4" />
                                    }
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent className="z-1000">{isPlaying ? t('pause') : t('play')}</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => {
                                        if (isLive) {
                                            setIsLive(false);
                                            clearInterval(liveUpdateTimerRef.current);
                                        }

                                        if (isPlaying) {
                                            setIsPlaying(false);
                                        }

                                        const nextTime = getTimeIncrement(currentTime);

                                        if (nextTime.isAfter(endDate)) {
                                            setCurrentTime(endDate);
                                            updateWMSLayer(endDate);
                                        } else {
                                            setCurrentTime(nextTime);
                                            updateWMSLayer(nextTime);
                                        }
                                    }}
                                    disabled={currentTime?.isSame(endDate) || isPlaying}
                                    className="bg-accent/50 hover:bg-accent disabled:opacity-50"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent  className="z-1000">{t('stepForward')}</TooltipContent>
                        </Tooltip>
                    </div>
                </div>

                <div className="flex-none">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {t('range')}
                        </span>
                        <Select
                            value={selectedRange}
                            onValueChange={(value) => {
                                handleRangeChange({ target: { value } });
                            }}
                        >
                            <SelectTrigger size="sm" className="h-7 min-w-[80px] text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-5000">
                                {rangeOptions.map(range => (
                                    <SelectItem key={range.value} value={range.value} className="text-xs">
                                        {range.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="flex-none">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {t('interval')}
                        </span>
                        <Select
                            disabled={isLive}
                            value={selectedInterval}
                            onValueChange={(value) => {
                                handleIntervalChange({ target: { value } });
                            }}
                        >
                            <SelectTrigger size="sm" className="h-7 min-w-[80px] text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-5000">
                                {availableIntervals.map(interval => (
                                    <SelectItem key={interval.value} value={interval.value} className="text-xs">
                                        {interval.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex-none">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon-sm"
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
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent className="z-1000">{isLive ? t('exitLive') : t('switchLive')}</TooltipContent>
                    </Tooltip>
                </div>
                <div className="flex-1 w-full md:w-auto min-w-0 mt-2 md:mt-0">
                    <div className="relative h-[30px] w-full flex items-center mt-2">
                        {/* Time Display */}
                        <div className="absolute -top-[18px] left-1/2 -translate-x-1/2 text-xs font-bold text-center whitespace-nowrap">
                            {isLive ? 'LIVE: ' : ''}{formatDateDisplay(currentTime)}{!isLive ? ` - ${formatDateDisplay(getTimeIncrement(currentTime))}` : ''}
                        </div>

                        <div className="absolute top-0 left-1 right-1 h-full flex justify-between pointer-events-none before:absolute before:top-[14px] before:left-0 before:right-0 before:h-0.5 before:bg-border before:z-0">
                            {[0, 4].map((mark) => (
                                <div
                                    key={mark}
                                    className={cn(
                                        "w-px mt-2.5 relative z-10",
                                        mark % 2 === 0 ? "h-2.5 bg-foreground" : "h-1.5 bg-muted-foreground"
                                    )}
                                />
                            ))}
                        </div>

                        <div className="w-full z-10">
                            <Slider
                                value={[sliderValue]}
                                onValueChange={(values) => {
                                    handleSliderChange(values[0]);
                                }}
                                min={0}
                                max={100}
                                step={getStepSizePercent()}
                                className="w-full"
                            />
                        </div>

                        <div className="absolute -bottom-[18px] left-0 right-0 flex justify-between px-0.5">
                            <span className="text-[0.65rem] text-muted-foreground truncate">
                                {formatDateDisplay(startDate)}
                            </span>
                            <span className="text-[0.65rem] text-muted-foreground truncate">
                                {formatDateDisplay(endDate)}
                            </span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
        </TooltipProvider>
    );
};