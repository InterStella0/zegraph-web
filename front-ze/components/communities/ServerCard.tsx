'use client';

import {Card, CardContent} from "components/ui/card";
import {Button} from "components/ui/button";
import {Wifi, WifiOff, BarChart3} from "lucide-react";
import Link from 'next/link';
import {toast} from "sonner";
import {useTranslations} from "next-intl";

const ServerCard = ({ server }) => {
    const t = useTranslations('home');
    const handleCopyIP = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(server.fullIp);
        toast.success(t('copiedToClipboard'));
    };

    return (
        <Card className="mb-2">
            <CardContent className="p-0 min-md:p-3">
                <div className="space-y-2">
                    <div className="flex flex-row justify-between items-center gap-4">
                        <div className="flex flex-row items-center gap-2 flex-1 min-w-0">
                            <div className="flex flex-row items-center gap-2 min-w-0">
                                {server.status ? (
                                    <Wifi className="h-4 w-4 flex-shrink-0 text-green-500" />
                                ) : (
                                    <WifiOff className="h-4 w-4 flex-shrink-0 text-red-500" />
                                )}
                                <span className="text-sm sm:text-base font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                                    {server.name}
                                </span>
                            </div>
                        </div>
                        <span className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 text-muted-foreground">
                            {server.players}/{server.max_players}
                        </span>
                    </div>
                    <div className="flex flex-row items-center gap-2 flex-1 min-w-0">
                        <div className="flex-1 min-w-0">
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-xs sm:text-xs font-mono px-2 py-1 h-auto transition-all select-all"
                                onClick={handleCopyIP}
                                title={t('clickToCopy', {ip: server.fullIp})}
                            >
                                {server.fullIp}
                            </Button>
                        </div>
                        <Button
                            asChild
                            variant="outline"
                            size="sm"
                        >
                            <Link href={`/servers/${server.gotoLink}`}>
                                <BarChart3 className="mr-2 h-4 w-4" /><span className="hidden min-sm:inline-block">{t('insights')}</span>
                            </Link>
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
export default ServerCard;