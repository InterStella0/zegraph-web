"use client"
import {useTranslations} from "next-intl";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "components/ui/card";
import { Button } from "components/ui/button";
import { Hourglass, Clock, RefreshCw } from "lucide-react";

export default function StillCalculatingPlayer() {
    const t = useTranslations('players.stillCalculating');
    const [seconds, setSeconds] = useState(10);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const router = useRouter();

    const onRetry = () => {
        setIsRefreshing(true);
        setSeconds(10);

        setTimeout(() => {
            router.refresh();
            setIsRefreshing(false);
        }, 1000);
    };

    useEffect(() => {
        if (seconds === 0) {
            onRetry();
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
                onClick={onRetry}
                disabled={isRefreshing}
                className="mt-2"
            >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? t('refreshing') : t('retryNow')}
            </Button>
        </Card>
    );
}
