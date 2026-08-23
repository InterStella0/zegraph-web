"use client"
import {useTranslations} from "next-intl";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "components/ui/card";
import { Button } from "components/ui/button";
import { Hourglass, Clock, RefreshCw } from "lucide-react";

const FIRST_DELAY = 10;
const MAX_DELAY = 40;

export default function StillCalculatingPlayer() {
    const t = useTranslations('players.stillCalculating');
    // `delay` is the current interval, `seconds` the countdown within it. Two pieces of state
    // because the countdown reaches zero having forgotten what it started from.
    const [delay, setDelay] = useState(FIRST_DELAY);
    const [seconds, setSeconds] = useState(FIRST_DELAY);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const router = useRouter();

    // Every retry re-runs the whole server render, six backend fetches included. Reaching this
    // screen at all now means the player has never been calculated on this server -- there is no
    // stored result to fall back on -- so the wait is a genuine one and a fixed 10s poll is just
    // load. Back off; the button is there for anyone who does not want to wait.
    const onRetry = (nextDelay = FIRST_DELAY) => {
        setIsRefreshing(true);
        setDelay(nextDelay);
        setSeconds(nextDelay);

        setTimeout(() => {
            router.refresh();
            setIsRefreshing(false);
        }, 1000);
    };

    useEffect(() => {
        if (seconds === 0) {
            onRetry(Math.min(delay * 2, MAX_DELAY));
            return;
        }

        const timer = setTimeout(() => {
            setSeconds((prev) => prev - 1);
        }, 1000);

        return () => clearTimeout(timer);
    }, [seconds]);

    return (
        <Card
            className="w-full p-8 text-center flex flex-col justify-center items-center gap-4 min-h-[260px] transition-opacity duration-400"
            style={{ opacity: isRefreshing ? 0.6 : 1 }}
        >
            <Hourglass className="w-12 h-12 text-muted-foreground" />

            <h2 className="text-xl font-medium">
                {isRefreshing ? t('refreshingData') : t('calculating')}
            </h2>

            <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {t('retryingIn', {seconds})}
            </p>

            <Button
                variant="outline"
                onClick={() => onRetry()}
                disabled={isRefreshing}
                className="mt-2"
            >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? t('refreshing') : t('retryNow')}
            </Button>
        </Card>
    );
}
