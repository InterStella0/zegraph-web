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
import { Button } from 'components/ui/button';
import { Label } from 'components/ui/label';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface ReportDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (reason: string, details?: string) => Promise<void>;
    itemType?: 'guide' | 'comment';
}

const reportReasons = [
    { value: 'spam', labelKey: 'reasonSpam' },
    { value: 'inappropriate', labelKey: 'reasonInappropriate' },
    { value: 'misleading', labelKey: 'reasonMisleading' },
    { value: 'harassment', labelKey: 'reasonHarassment' },
    { value: 'other', labelKey: 'reasonOther' },
];

export default function ReportDialog({
    open,
    onClose,
    onSubmit,
    itemType = 'guide'
}: ReportDialogProps) {
    const t = useTranslations('guides.report');
    const [reason, setReason] = useState<string>('');
    const [details, setDetails] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!reason) {
            toast.error(t('selectReasonError'));
            return;
        }

        setSubmitting(true);
        try {
            await onSubmit(reason, details);
            toast.success(t('submitSuccess'), {
                description: t('submitSuccessDesc')
            });
            // Reset and close
            setReason('');
            setDetails('');
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
            onClose();
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{itemType === 'guide' ? t('titleGuide') : t('titleComment')}</DialogTitle>
                    <DialogDescription>
                        {t('description')}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="reason">{t('reasonLabel')}</Label>
                        <Select value={reason} onValueChange={setReason}>
                            <SelectTrigger id="reason">
                                <SelectValue placeholder={t('selectReason')} />
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
