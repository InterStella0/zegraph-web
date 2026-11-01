'use client'
import {SessionHeader} from "components/sessions/SessionHeader.tsx";
import {SessionStats} from "components/sessions/SessionStats.tsx";
import {ServerPopChart} from "components/sessions/ServerPopChart.tsx";
import MatchScoreChart from "components/sessions/MatchScoreChart.tsx";
import MapsList from "components/sessions/MapsList.tsx";
import MutualSessionsDisplay from "components/sessions/MutualSessionsDisplay.tsx";
import {LockedSessionChartCard, SessionLayout, useLiveSession} from "components/sessions/SessionLayout";
import {use} from "react";
import {getSessionData, SessionData} from "./utils.ts";
import {sessionScoresLocked} from "../../../../util.ts";
import {useSignedIn} from "components/auth/SignedIn";
import LoginLocked from "components/ui/LoginLocked";
import {useTranslations} from "next-intl";

const reload = (data: SessionData) => getSessionData(data.server, data.player.id, data.sessionInfo.id);

export default function SessionPlayerWrapper({ sessionPromise }: { sessionPromise: Promise<SessionData> }) {
    const { server, player, sessionInfo, mutualSessions, serverGraph, maps, mapImages } = useLiveSession(use(sessionPromise), reload)
    const scoresLocked = sessionScoresLocked(useSignedIn(), maps)
    const t = useTranslations('sessions')

    return <SessionLayout
        header={<SessionHeader server={server} player={player} sessionInfo={sessionInfo} />}
        main={<>
            <SessionStats
                sessionInfo={sessionInfo}
                maps={maps}
                mutualSessions={mutualSessions}
                serverGraph={serverGraph}
            />
            <ServerPopChart sessionInfo={sessionInfo} maps={maps} serverGraph={serverGraph} />
            {scoresLocked
                ? <LockedSessionChartCard title={t('matchScoreProgression')} description={t('roundByRound')} />
                : <MatchScoreChart sessionInfo={sessionInfo} maps={maps} />}
            <MapsList server={server} maps={maps} mapImages={mapImages} scoresLocked={scoresLocked} />
        </>}
        side={mutualSessions
            ? <MutualSessionsDisplay server={server} mutualSessions={mutualSessions} type="player" />
            : <LoginLocked title={t('mutualSessions')} />}
    />
}
