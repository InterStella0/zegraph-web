'use client'

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from 'components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from 'components/ui/select';
import { Textarea } from 'components/ui/textarea';
import { Input } from 'components/ui/input';
import { Button } from 'components/ui/button';
import { Label } from 'components/ui/label';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface MusicReportDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (reason: string, details?: string, youtubeUrl?: string) => Promise<void>;
    musicTitle: string;
    currentYoutubeId?: string | null;
}

const reportReasons = [
    { value: 'video_unavailable', labelKey: 'reasonUnavailable' },
    { value: 'wrong_video', labelKey: 'reasonWrongVideo' },
];

export default function MusicReportDialog({
    open,
    onClose,
    onSubmit,
    musicTitle,
    currentYoutubeId
}: MusicReportDialogProps) {
    const t = useTranslations('maps.musicReport');
    const [reason, setReason] = useState<string>('');
    const [details, setDetails] = useState('');
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!reason) {
            toast.error(t('selectReasonError'));
            return;
        }

        setSubmitting(true);
        try {
            await onSubmit(reason, details || undefined, youtubeUrl || undefined);
            toast.success(t('submitSuccess'), {
                description: t('submitSuccessDesc')
            });
            // Reset and close
            setReason('');
            setDetails('');
            setYoutubeUrl('');
            onClose();
        } catch (error: any) {
            toast.error(t('submitFailed'), {
                description: error.message || t('tryAgainLater')
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = () => {
        if (!submitting) {
            setReason('');
            setDetails('');
            setYoutubeUrl('');
            onClose();
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>
                        {t('description', {title: musicTitle})}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {currentYoutubeId && (
                        <div className="p-3 bg-muted rounded-md text-sm">
                            <span className="font-medium">{t('currentVideoId')}</span> {currentYoutubeId}
                        </div>
                    )}

                    <div className="grid gap-2">
                        <Label htmlFor="reason">{t('issueType')}</Label>
                        <Select value={reason} onValueChange={setReason}>
                            <SelectTrigger id="reason">
                                <SelectValue placeholder={t('selectIssueType')} />
                            </SelectTrigger>
                            <SelectContent>
                                {reportReasons.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {t(option.labelKey)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="youtube-url">{t('suggestedUrl')}</Label>
                        <Input
                            id="youtube-url"
                            placeholder="https://www.youtube.com/watch?v=..."
                            value={youtubeUrl}
                            onChange={(e) => setYoutubeUrl(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            {t('suggestedUrlHint')}
                        </p>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="details">{t('detailsLabel')}</Label>
                        <Textarea
                            id="details"
                            placeholder={t('detailsPlaceholder')}
                            value={details}
                            onChange={(e) => setDetails(e.target.value)}
                            rows={4}
                            maxLength={500}
                        />
                        <p className="text-xs text-muted-foreground">
                            {t('charCount', {count: details.length, max: 500})}
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={handleClose}
                        disabled={submitting}
                    >
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={submitting || !reason}
                    >
                        {submitting ? t('submitting') : t('submitReport')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
