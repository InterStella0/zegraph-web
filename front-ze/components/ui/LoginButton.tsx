'use client'
import {Avatar, AvatarFallback, AvatarImage} from "components/ui/avatar";
import {Button} from "components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "components/ui/dropdown-menu";
import {LogOut, User, Shield, Cog} from "lucide-react";
import {useLoginDialog} from "./LoginDialog.tsx";
import {signOut} from "next-auth/react";
import {useRouter} from "next/navigation";
import {SteamProfile} from "types/steam";
import {useTranslations} from "next-intl";

function UserMenu({ user }: { user: SteamProfile | null }) {
    const t = useTranslations('auth');
    const router = useRouter();
    const links = [
        { href: '/players/me/profile', Icon: User, label: t('profile') },
        { href: '/settings/notifications', Icon: Cog, label: t('settings') },
        ...(user?.is_superuser || user?.is_map_manager ? [{ href: '/admin', Icon: Shield, label: t('admin') }] : []),
    ];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-[8%]">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.avatar} alt={user?.personaname} />
                        <AvatarFallback>
                            {user?.personaname?.[0]?.toUpperCase() || 'U'}
                        </AvatarFallback>
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-sm text-muted-foreground">
                    {user?.personaname}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {links.map(({ href, Icon, label }) => (
                    <DropdownMenuItem key={href} onClick={() => router.push(href)}>
                        <Icon className="mr-2 h-4 w-4" />
                        {label}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => signOut()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('logout')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default function LoginButton({user, steamLabelClassName = "hidden min-[965px]:block"}: { user: SteamProfile | null, steamLabelClassName?: string }){
    const t = useTranslations('auth');
    const {openLogin, loginDialog} = useLoginDialog();
    return <>
        {user ? (
            <UserMenu user={user} />
        ) : (
            <Button onClick={openLogin} variant="outline" size="sm">
                {t('login')}<span className={steamLabelClassName}>{t('withSteam')}</span>
            </Button>
        )}
        {loginDialog}
    </>
}
