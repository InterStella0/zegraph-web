'use client'

import { useState } from 'react';
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
import {useLoginDialog} from 'components/ui/LoginDialog';
import { fetchApiUrl } from 'utils/generalUtils';
import { sendJson } from 'lib/sendJson';
import { useResource } from 'lib/hooks/useResource';
import { SteamProfile } from 'types/steam';
import { PlayerClaimState } from 'types/players';

const NOTE_MAX = 500;

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
    const {openLogin, loginDialog} = useLoginDialog();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);

    const possible = !byId && !associatedPlayerId && !/^\d+$/.test(playerId);
    const { data: state } = useResource<PlayerClaimState>(
        () => possible ? fetchApiUrl(`/accounts/player-claims/${serverId}/${playerId}`) : null,
        [possible, serverId, playerId, refreshTick], { keepData: true, errorLog: 'Failed to load claim state:' });

    if (!possible || !state || (!state.claimable && !state.pending)) return null;

    const handleClick = () => user ? setConfirmOpen(true) : openLogin();

    const handleClose = () => {
        if (submitting) return;
        setNote('');
        setConfirmOpen(false);
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            await sendJson('/accounts/player-claims', 'POST', {
                server_id: serverId,
                player_id: playerId,
                note: note.trim() || null,
            });
            toast.success(t('submitSuccess'), { description: t('submitSuccessDesc') });
            setNote('');
            setConfirmOpen(false);
            setRefreshTick(n => n + 1);
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
            {loginDialog}

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
