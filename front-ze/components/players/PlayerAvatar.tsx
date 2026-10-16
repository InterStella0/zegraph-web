'use client'
import { Avatar, AvatarFallback } from "components/ui/avatar";
import { useEffect, useRef, useState } from "react";
import { loadPlayerPfp } from "lib/batchLoader";
import { ErrorBoundary } from "react-error-boundary";
import { useServerData } from "../../app/servers/[server_slug]/ServerDataProvider";
import Image from "next/image";
import { cn } from "components/lib/utils";

function PlayerAvatarDisplay({ uuid, name, width = 40, height = 40, anonymous = false, className, serverId, pfp = null, ...props }) {
    const avatarRef = useRef(null);
    const [playerImage, setPlayerImage] = useState(pfp);
    const data = useServerData();
    const server_id = serverId ?? data?.server?.id;

    useEffect(() => {
        if (!playerImage && !anonymous) {
            loadPlayerPfp(uuid).then(setPlayerImage);
        }
    }, [server_id, uuid, playerImage, anonymous]);

    const getAvatarColor = (name) => {
        if (!name) return '#757575'; // Default gray for undefined names

        const colors = [
            '#4CAF50', '#2196F3', '#9C27B0', '#F44336',
            '#FF9800', '#3F51B5', '#00BCD4', '#E91E63'
        ];

        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }

        return colors[Math.abs(hash) % colors.length];
    };

    const avatarKey = `avatar-${uuid}`;

    if (!playerImage || playerImage.full === "N/A") {
        return (
            <Avatar
                key={avatarKey}
                className={cn(className)}
                style={{ width: `${width}px`, height: `${height}px` }}
            >
                <AvatarFallback
                    className="text-white font-semibold"
                    style={{ backgroundColor: getAvatarColor(name) }}
                >
                    {name && name.length > 0 ? [...name][0].toUpperCase() : '?'}
                </AvatarFallback>
            </Avatar>
        );
    }

    return (
        <Image
            key={avatarKey}
            loading="lazy"
            unoptimized
            title={name}
            alt={`${name}'s profile picture`}
            ref={avatarRef}
            src={playerImage.full}
            width={width}
            height={height}
            className={cn("rounded-full", className)}
            {...props}
        />
    );
}

function PlayerErrorAvatar() {
    return (
        <Avatar>
            <AvatarFallback className="bg-destructive text-destructive-foreground">
                !
            </AvatarFallback>
        </Avatar>
    );
}

export function PlayerAvatar(props) {
    return (
        <ErrorBoundary fallback={<PlayerErrorAvatar />}>
            <PlayerAvatarDisplay {...props} />
        </ErrorBoundary>
    );
}
