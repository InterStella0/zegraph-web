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
import {useState} from "react";
import {LogOut, User, Shield, Cog} from "lucide-react";
import LoginDialog from "./LoginDialog.tsx";
import {signOut} from "next-auth/react";
import {useRouter} from "next/navigation";
import {SteamProfile} from "../../next-auth-steam/steam.ts";

function UserMenu({ user }: { user: SteamProfile | null }) {
    const router = useRouter();
    const canAccessAdmin = user?.is_superuser || user?.is_map_manager || false;

    const handleProfile = () => {
        router.push('/users/me/profile');
    };

    const handleAdmin = () => {
        router.push('/admin');
    };
    const handleSettings = () => {
        router.push('/settings/notifications');
    };

    const handleLogout = () => {
        signOut();
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.avatar} alt={user?.global_name} />
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
                <DropdownMenuItem onClick={handleProfile}>
                    <User className="mr-2 h-4 w-4" />
                    Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSettings}>
                    <Cog className="mr-2 h-4 w-4" />
                    Settings
                </DropdownMenuItem>
                {canAccessAdmin && (
                    <DropdownMenuItem onClick={handleAdmin}>
                        <Shield className="mr-2 h-4 w-4" />
                        Admin
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default function LoginButton({user}: { user: SteamProfile | null}){
    const [loginDialogOpen, setLoginDialogOpen] = useState(false);

    const handleLoginClick = () => {
        setLoginDialogOpen(true);
    };
    return <>
        {
        user ? (
        <UserMenu user={user} />
    ) : (
        <Button
            onClick={handleLoginClick}
            variant="outline"
            size="sm"
        >
            Login<span className="hidden min-[965px]:block">with Steam</span>
        </Button>
    )}
        <LoginDialog
            open={loginDialogOpen}
            onClose={() => setLoginDialogOpen(false)}
        />
    </>
}