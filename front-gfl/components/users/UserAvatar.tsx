'use client'
import { useEffect, useState } from "react";
import { fetchUrl } from "utils/generalUtils";
import { ErrorBoundary } from "react-error-boundary";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "components/ui/avatar";

function UserAvatarDisplay({ userId, name, width = 120, height = 120, className = "", ...props }) {
    const t = useTranslations('players.profile.header');
    const [playerImage, setPlayerImage] = useState(null);

    useEffect(() => {
        if (!userId) return;
        fetchUrl(`/players/${userId}/pfp`)
            .then(image => {
                setPlayerImage(image);
            })
            .catch(error => {
                if (error.code !== 404)
                    console.error(`Failed to fetch avatar for user ${userId}:`, error);
                setPlayerImage(null);
            });
    }, [userId]);

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

    return (
        <Avatar
            className={className}
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
            <AvatarFallback
                className="text-white font-semibold"
                style={{
                    backgroundColor: avatarColor,
                    fontSize: `${width / 3}px`,
                }}
            >
                {name && name.length > 0 ? name.charAt(0).toUpperCase() : '?'}
            </AvatarFallback>
        </Avatar>
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
