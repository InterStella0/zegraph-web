'use client'
import { useEffect, useState } from "react";
import { fetchUrl } from "utils/generalUtils";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "components/ui/avatar";
import { cn } from "components/lib/utils";

// Steam draws avatar frames this much larger than the avatar, centred on it.
const FRAME_SCALE = 1.22;

function UserAvatarDisplay({ userId, name, width = 120, height = 120, className = "", pfpPromise = null, frame = null, animatedAvatar = null }) {
    const t = useTranslations('players.profile.header');
    const [playerImage, setPlayerImage] = useState(null);

    useEffect(() => {
        if (!userId) return;
        Promise.resolve(pfpPromise ?? fetchUrl(`/players/${userId}/pfp`))
            .then(image => {
                setPlayerImage(image);
            })
            .catch(error => {
                if (error.code !== 404)
                    console.error(`Failed to fetch avatar for user ${userId}:`, error);
                setPlayerImage(null);
            });
    }, [userId, pfpPromise]);

    const getAvatarColor = (name: string) => {
        if (!name) return 'hsl(var(--muted))';

        const colors = [
            'hsl(142, 76%, 36%)',  // green
            'hsl(217, 91%, 60%)',  // blue
            'hsl(271, 91%, 65%)',  // purple
            'hsl(0, 84%, 60%)',    // red
            'hsl(36, 100%, 50%)',  // orange
            'hsl(231, 48%, 48%)',  // indigo
            'hsl(187, 100%, 42%)', // cyan
            'hsl(340, 82%, 52%)',  // pink
        ];

        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }

        return colors[Math.abs(hash) % colors.length];
    };

    const avatarColor = getAvatarColor(name);
    const avatarKey = `avatar-${userId || 'user'}`;

    // Frames are drawn for Steam's square avatars, so a framed avatar drops the rounding.
    const shape = frame ? "rounded-none" : "";
    const frameOffset = `${(1 - FRAME_SCALE) / 2 * 100}%`;

    return (
        <div className="relative" style={{ width: `${width}px`, height: `${height}px` }}>
            <Avatar
                className={cn(className, shape)}
                style={{
                    width: `${width}px`,
                    height: `${height}px`,
                }}
            >
                {playerImage?.full && (
                    <AvatarImage
                        key={avatarKey}
                        src={playerImage.full}
                        alt={t('avatarAlt', { name })}
                    />
                )}
                {animatedAvatar && (
                    // Layered over the static picture so it stays visible until the GIF loads.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={animatedAvatar}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 size-full object-cover"
                    />
                )}
                <AvatarFallback
                    className={cn("text-white font-semibold", shape)}
                    style={{
                        backgroundColor: avatarColor,
                        fontSize: `${width / 3}px`,
                    }}
                >
                    {name && name.length > 0 ? name.charAt(0).toUpperCase() : '?'}
                </AvatarFallback>
            </Avatar>
            {frame && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={frame}
                    alt=""
                    aria-hidden
                    className="pointer-events-none absolute max-w-none"
                    style={{
                        top: frameOffset,
                        left: frameOffset,
                        width: `${FRAME_SCALE * 100}%`,
                        height: `${FRAME_SCALE * 100}%`,
                    }}
                />
            )}
        </div>
    );
}

function UserErrorAvatar({ width = 120, height = 120 }) {
    return (
        <Avatar style={{ width: `${width}px`, height: `${height}px` }}>
            <AvatarFallback className="bg-destructive text-destructive-foreground">
                !
            </AvatarFallback>
        </Avatar>
    );
}

export function UserAvatar(props) {
    return (
        <ErrorBoundary fallback={<UserErrorAvatar width={props.width} height={props.height} />}>
            <UserAvatarDisplay {...props} />
        </ErrorBoundary>
    );
}
