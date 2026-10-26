'use client'
import {Heart} from "lucide-react";
import {Button} from "components/ui/button";
import {useLoginDialog} from "components/ui/LoginDialog";
import {cn} from "components/lib/utils";
import {fetchApiUrl} from "utils/generalUtils";

type FavoriteRequest = (mapName: string, favorite: boolean) => Promise<unknown>

const setGlobalFavorite: FavoriteRequest = (mapName, favorite) =>
    fetchApiUrl(`/maps/${encodeURIComponent(mapName)}/${favorite ? 'set-favorite' : 'unset-favorite'}`, {method: 'POST'})

/** Favourite toggling for signed-in users; anyone else gets the login dialog instead. */
export function useFavoriteToggle(
    loggedIn: boolean,
    favorites: Set<string>,
    onToggled: (mapName: string, favorite: boolean) => void,
    request: FavoriteRequest = setGlobalFavorite,
) {
    const {openLogin, loginDialog} = useLoginDialog();
    const toggleFavorite = async (mapName: string) => {
        if (!loggedIn) return openLogin();
        const favorite = !favorites.has(mapName);
        try {
            await request(mapName, favorite);
            onToggled(mapName, favorite);
        } catch (err) {
            console.error('Failed to toggle favorite:', err);
        }
    };
    return {toggleFavorite, loginDialog};
}

export function FavoriteButton({ mapName, favorites, toggleFavorite, className }: {
    mapName: string, favorites: Set<string>, toggleFavorite: (mapName: string) => void, className?: string,
}) {
    const isFavorite = favorites.has(mapName);
    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={() => toggleFavorite(mapName)}
            className={cn("transition-all hover:scale-110", isFavorite && 'text-primary', className)}
        >
            <Heart className={cn("h-5 w-5", isFavorite && "fill-current")}/>
        </Button>
    );
}
