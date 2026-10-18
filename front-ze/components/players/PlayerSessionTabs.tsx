'use client'
import {ReactElement, useState} from "react";
import {useTranslations} from "next-intl";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "components/ui/tabs";
import PlayerSessionList from "./PlayerSessionList.tsx";
import PlayerPlayedWith from "./PlayerPlayedWith.tsx";
import {ServerPlayerDetailed} from "../../app/servers/[server_slug]/players/[player_id]/page.tsx";
import {PeriodChip} from "../../app/servers/[server_slug]/players/[player_id]/PlayerPeriod.tsx";

type SessionTab = 'sessions' | 'playedWith';

export default function PlayerSessionTabs({ serverPlayerPromise }: { serverPlayerPromise: Promise<ServerPlayerDetailed> }): ReactElement {
    const t = useTranslations('players');
    const [tab, setTab] = useState<SessionTab>('sessions');
    const [playedWithOpened, setPlayedWithOpened] = useState(false);

    const changeTab = (value: string) => {
        setTab(value as SessionTab);
        if (value === 'playedWith') setPlayedWithOpened(true);
    };

    const heading = <div className="flex items-center gap-2">
        <TabsList>
            <TabsTrigger value="sessions">{t('sessions.title')}</TabsTrigger>
            <TabsTrigger value="playedWith">{t('playedWith.title')}</TabsTrigger>
        </TabsList>
        <PeriodChip />
    </div>;

    return (
        <Tabs value={tab} onValueChange={changeTab} className="w-full gap-0">
            <TabsContent value="sessions" forceMount className="data-[state=inactive]:hidden">
                <PlayerSessionList serverPlayerPromise={serverPlayerPromise} heading={heading} />
            </TabsContent>
            <TabsContent value="playedWith" forceMount className="data-[state=inactive]:hidden">
                {playedWithOpened && <PlayerPlayedWith serverPlayerPromise={serverPlayerPromise} heading={heading} />}
            </TabsContent>
        </Tabs>
    );
}
