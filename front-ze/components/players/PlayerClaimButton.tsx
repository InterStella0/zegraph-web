'use client'

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BadgeCheck, Hourglass } from 'lucide-react';
import { Button } from 'components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from 'components/ui/dialog';
import { Label } from 'components/ui/label';
import { Textarea } from 'components/ui/textarea';
import LoginDialog from 'components/ui/LoginDialog';
import { fetchApiUrl } from 'utils/generalUtils';
import { SteamProfile } from '../../next-auth-steam/steam';
import { PlayerClaimState } from 'types/players';

const NOTE_MAX = 500;

/** Steam-tracked rows use the numeric Steam ID as their id; name rows do not. */
function isSteamId(playerId: string): boolean {
    return /^\d+$/.test(playerId);
}

/**
 * Lets a player ask a moderator to link a name-tracked profile to their Steam account.
 *
 * Only meaningful on servers that track players by name (`server.byId === false`), where one
 * person is spread across several `player` rows. Approving the claim sets
 * `player.associated_player_id`, which is what makes the Steam and global-profile links appear.
 */
export default function PlayerClaimButton(
    { serverId, playerId, byId, associatedPlayerId, user }: {
        serverId: string,
        playerId: string,
        byId: boolean,
        associatedPlayerId: string | null,
        user: SteamProfile | null,
    },
) {
    const t = useTranslations('players.claim');
    const [state, setState] = useState<PlayerClaimState | null>(null);
    const [loginOpen, setLoginOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Cheap local checks first, so a Steam-tracked or already-linked profile never costs a request.
    const possible = !byId && !associatedPlayerId && !isSteamId(playerId);

    const refresh = useCallback(async () => {
        try {
            const data = await fetchApiUrl(`/accounts/player-claims/${serverId}/${playerId}`);
            setState(data as PlayerClaimState);
        } catch (error) {
            console.error('Failed to load claim state:', error);
        }
    }, [serverId, playerId]);

    useEffect(() => {
        if (!possible) return;
        refresh();
    }, [possible, refresh]);

    if (!possible || !state || (!state.claimable && !state.pending)) return null;

    const handleClick = () => {
        if (!user) {
            setLoginOpen(true);
            return;
        }
        setConfirmOpen(true);
    };

    const handleClose = () => {
        if (submitting) return;
        setNote('');
        setConfirmOpen(false);
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            await fetchApiUrl('/accounts/player-claims', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    server_id: serverId,
                    player_id: playerId,
                    note: note.trim() || null,
                }),
            });
            toast.success(t('submitSuccess'), { description: t('submitSuccessDesc') });
            setNote('');
            setConfirmOpen(false);
            await refresh();
        } catch (error: any) {
            toast.error(t('submitFailed'), {
                description: error?.message || t('tryAgainLater'),
            });
        } finally {
            setSubmitting(false);
        }
    };

    if (state.pending) {
        return (
            <Button variant="outline" size="sm" disabled title={t('pendingHint')}>
                <Hourglass className="h-4 w-4" />
                {t('pending')}
            </Button>
        );
    }

    return (
        <>
            <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />

            <Button variant="outline" size="sm" onClick={handleClick}>
                <BadgeCheck className="h-4 w-4" />
                {t('claim')}
            </Button>

            <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('confirmTitle')}</DialogTitle>
                        <DialogDescription>{t('confirmBody')}</DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-2 py-2">
                        <Label htmlFor="claimNote">
                            {t('noteLabel')}{' '}
                            <span className="text-xs text-muted-foreground">{t('optional')}</span>
                        </Label>
                        <Textarea
                            id="claimNote"
                            placeholder={t('notePlaceholder')}
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            maxLength={NOTE_MAX}
                            rows={3}
                        />
                        <p className="text-xs text-muted-foreground">
                            {t('charCount', { count: note.length, max: NOTE_MAX })}
                        </p>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={handleClose} disabled={submitting}>
                            {t('cancel')}
                        </Button>
                        <Button onClick={handleSubmit} disabled={submitting}>
                            {submitting ? t('submitting') : t('confirmSubmit')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
