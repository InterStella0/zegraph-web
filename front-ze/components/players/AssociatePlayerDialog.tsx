'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Link2, Link2Off, Loader2 } from 'lucide-react';
import { Button } from 'components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from 'components/ui/dialog';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import { fetchApiServerUrl, fetchApiUrl } from 'utils/generalUtils';
import { SearchPlayer } from 'types/players';

const SUGGESTION_MIN_CHARS = 2;
const SUGGESTION_DEBOUNCE_MS = 300;

/**
 * Superuser-only control for setting `player.associated_player_id` by hand.
 *
 * Approving a claim takes the same backend path; this is the override for the cases a claim
 * cannot cover — linking on someone's behalf, correcting a mistake, or unlinking. The target is
 * normally a Steam ID from a different, Steam-tracked server, so the field takes a raw ID; the
 * name search is a convenience for merging two name rows on this same server.
 */
export default function AssociatePlayerDialog(
    { serverId, playerId, playerName, associatedPlayerId }: {
        serverId: string,
        playerId: string,
        playerName: string,
        associatedPlayerId: string | null,
    },
) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [target, setTarget] = useState(associatedPlayerId ?? '');
    const [search, setSearch] = useState('');
    const [suggestions, setSuggestions] = useState<SearchPlayer[]>([]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        const trimmed = search.trim();
        if (trimmed.length < SUGGESTION_MIN_CHARS) {
            setSuggestions([]);
            return;
        }

        const abortController = new AbortController();
        const { signal } = abortController;
        const timer = setTimeout(() => {
            fetchApiServerUrl(serverId, '/players/autocomplete', { params: { player_name: trimmed }, signal })
                .then((data: SearchPlayer[]) => setSuggestions((data ?? []).filter(p => p.id !== playerId)))
                .catch(error => {
                    if (signal.aborted) return;
                    console.error('Error fetching player suggestions:', error);
                    setSuggestions([]);
                });
        }, SUGGESTION_DEBOUNCE_MS);

        return () => {
            clearTimeout(timer);
            abortController.abort('Changed');
        };
    }, [open, search, serverId, playerId]);

    const handleClose = () => {
        if (submitting) return;
        setSearch('');
        setSuggestions([]);
        setTarget(associatedPlayerId ?? '');
        setOpen(false);
    };

    const save = async (value: string | null) => {
        setSubmitting(true);
        try {
            await fetchApiUrl(`/admin/players/${playerId}/associated`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ associated_player_id: value }),
            });
            toast.success(value ? 'Profile linked' : 'Profile unlinked');
            setOpen(false);
            setSearch('');
            setSuggestions([]);
            router.refresh();
        } catch (error: any) {
            toast.error('Failed to update link', {
                description: error?.message || 'Please try again later.',
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleLink = () => {
        const trimmed = target.trim();
        if (!/^\d+$/.test(trimmed)) {
            toast.error('Enter a numeric Steam ID, or pick a player from the search results');
            return;
        }
        save(trimmed);
    };

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <Link2 className="h-4 w-4" />
                Link account
            </Button>

            <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Link profile to an account</DialogTitle>
                        <DialogDescription>
                            Sets <span className="font-mono">associated_player_id</span> on{' '}
                            <span className="font-medium">{playerName}</span>, merging this profile
                            into the account you choose.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-5 py-2">
                        <div className="grid gap-2">
                            <Label htmlFor="associateTarget">Steam ID</Label>
                            <Input
                                id="associateTarget"
                                placeholder="e.g. 76561198000000000"
                                value={target}
                                onChange={e => setTarget(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                The account must already exist as a player record — it has to have
                                been seen on a Steam-tracked server.
                            </p>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="associateSearch">
                                Or search this server{' '}
                                <span className="text-xs text-muted-foreground">
                                    (to merge two name records)
                                </span>
                            </Label>
                            <Input
                                id="associateSearch"
                                placeholder="Player name…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            {suggestions.length > 0 && (
                                <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
                                    {suggestions.map(player => (
                                        <button
                                            key={player.id}
                                            type="button"
                                            onClick={() => { setTarget(player.id); setSearch(''); setSuggestions([]); }}
                                            className="w-full text-left px-3 py-2 hover:bg-accent/60 transition-colors"
                                        >
                                            <div className="text-sm">{player.name}</div>
                                            <div className="text-xs text-muted-foreground font-mono">{player.id}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter className="sm:justify-between">
                        {associatedPlayerId ? (
                            <Button
                                variant="ghost"
                                onClick={() => save(null)}
                                disabled={submitting}
                                className="text-destructive hover:text-destructive"
                            >
                                <Link2Off className="h-4 w-4" />
                                Unlink
                            </Button>
                        ) : <span />}
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={handleClose} disabled={submitting}>
                                Cancel
                            </Button>
                            <Button onClick={handleLink} disabled={submitting}>
                                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                Link
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
