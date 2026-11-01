'use client'
import {useState} from "react";
import {useTranslations} from "next-intl";
import {Check, CircleCheck, Loader2, MonitorPlay, Play, RotateCcw, Timer, X} from "lucide-react";
import {Button} from "components/ui/button";
import {Tooltip, TooltipContent, TooltipTrigger} from "components/ui/tooltip";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "components/ui/dialog";
import {Server} from "types/community";
import {SteamProfile} from "types/steam";
import {useAutoJoin} from "components/servers/useAutoJoin";

/** Arms an automatic Steam join for the next free slot on `server`. */
export default function AutoJoinButton({ server, user }: { server: Server, user: SteamProfile | null }) {
    const t = useTranslations('servers.autoJoin')
    const {status, view, steamDetected, connectUrl, start, launch, confirmArm, cancel, testLaunch, reportNotLaunched} =
        useAutoJoin(server, user?.personaname ?? null)
    const [showHelp, setShowHelp] = useState(false)

    if (!server.status) return null

    const begin = () => {
        setShowHelp(false)
        start()
    }

    if (status === 'waiting') {
        const label = !view
            ? t('connecting')
            : view.online
                ? t('waiting', {count: view.count, max: view.maxPlayers})
                : t('serverOffline')
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="secondary" size="sm" onClick={cancel} aria-label={t('cancel')}>
                        <span className="relative mr-2 flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                        </span>
                        {label}
                        <X className="ml-2 h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>{t('waitingHint')}</TooltipContent>
            </Tooltip>
        )
    }

    if (status === 'fired') {
        return (
            <>
                <Button variant="default" size="sm" asChild>
                    <a href={connectUrl} onClick={reportNotLaunched}>
                        <Play className="mr-2 h-4 w-4" />
                        {t('didntLaunch')}
                    </a>
                </Button>
                <Button variant="outline" size="sm" onClick={begin}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t('rearm')}
                </Button>
            </>
        )
    }

    if (status === 'already-in') {
        return (
            <Button variant="outline" size="sm" onClick={cancel} aria-label={t('dismiss')}>
                <CircleCheck className="mr-2 h-4 w-4 text-green-500" />
                {t('alreadyIn')}
                <X className="ml-2 h-4 w-4" />
            </Button>
        )
    }

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={begin} disabled={status === 'confirming'}>
                        {status === 'confirming'
                            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            : <Timer className="mr-2 h-4 w-4" />}
                        {t('autoJoin')}
                    </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{t('hint')}</TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="px-2" onClick={testLaunch} aria-label={t('testLaunch')}>
                        <MonitorPlay className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>{t('testLaunch')}</TooltipContent>
            </Tooltip>

            <Dialog open={status === 'confirming'} onOpenChange={open => { if (!open) cancel() }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('dialogTitle')}</DialogTitle>
                        <DialogDescription>{t('dialogDescription', {server: server.name})}</DialogDescription>
                    </DialogHeader>

                    {steamDetected && (
                        <p className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                            <Check className="h-4 w-4" />
                            {t('steamDetected')}
                        </p>
                    )}

                    {showHelp && (
                        <div className="space-y-3 rounded-md border p-3 text-sm text-muted-foreground">
                            <p>{t('helpText')}</p>
                            <Button variant="secondary" size="sm" onClick={launch}>
                                <RotateCcw className="mr-2 h-4 w-4" />
                                {t('tryAgain')}
                            </Button>
                        </div>
                    )}

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setShowHelp(true)}>
                            {t('didntOpen')}
                        </Button>
                        <Button onClick={confirmArm}>
                            {t('confirmArm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
