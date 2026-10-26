'use client'

import { ReactNode, useState } from 'react';
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
import { Input } from 'components/ui/input';
import { Textarea } from 'components/ui/textarea';
import { Button } from 'components/ui/button';
import { Label } from 'components/ui/label';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import {useLoginDialog} from 'components/ui/LoginDialog';
import { sendJson } from 'lib/sendJson';
import { SteamProfile } from 'types/steam';

interface ServerEntry {
    ipPort: string;
    readableLink: string;
}

const EMPTY_SERVER: ServerEntry = { ipPort: '', readableLink: '' };
const EMPTY_FORM = { communityName: '', iconUrl: '', gameType: '', elaboration: '' };

interface RequestServerDialogProps {
    user: SteamProfile | null;
    open: boolean;
    onClose: () => void;
}

function Field({ label, htmlFor, required = false, children }: { label: string, htmlFor?: string, required?: boolean, children: ReactNode }) {
    return (
        <div className="grid gap-2">
            <Label htmlFor={htmlFor}>
                {label} {required
                    ? <span className="text-destructive">*</span>
                    : <span className="text-xs text-muted-foreground">(optional)</span>}
            </Label>
            {children}
        </div>
    );
}

export default function RequestServerDialog({ user, open, onClose }: RequestServerDialogProps) {
    const {openLogin, loginDialog} = useLoginDialog();
    const [form, setForm] = useState(EMPTY_FORM);
    const [servers, setServers] = useState<ServerEntry[]>([EMPTY_SERVER]);
    const [submitting, setSubmitting] = useState(false);
    const { communityName, iconUrl, gameType, elaboration } = form;
    const setField = (field: keyof typeof EMPTY_FORM) => (value: string) => setForm(prev => ({ ...prev, [field]: value }));

    const handleClose = () => {
        if (submitting) return;
        setForm(EMPTY_FORM);
        setServers([EMPTY_SERVER]);
        onClose();
    };

    const updateServer = (index: number, field: keyof ServerEntry, value: string) => {
        setServers(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
    };

    const handleSubmit = async () => {
        if (!user) {
            onClose();
            openLogin();
            return;
        }

        if (!communityName.trim()) return toast.error('Community name is required');
        if (!gameType) return toast.error('Please select a game');
        for (const s of servers) {
            if (!s.ipPort.trim()) return toast.error('All server IP:port fields must be filled in');
            if (!s.readableLink.trim() || s.readableLink.length > 20) return toast.error('Readable link must be 1–20 characters');
        }

        const parsedServers = [];
        for (const s of servers) {
            const lastColon = s.ipPort.lastIndexOf(':');
            if (lastColon === -1) return toast.error(`Invalid format "${s.ipPort}" — use IP:port`);
            const ip = s.ipPort.slice(0, lastColon).trim();
            const port = parseInt(s.ipPort.slice(lastColon + 1).trim(), 10);
            if (!ip || isNaN(port) || port < 1 || port > 65535) return toast.error(`Invalid IP or port in "${s.ipPort}"`);
            parsedServers.push({ ip, port, readable_link: s.readableLink.trim() });
        }

        setSubmitting(true);
        try {
            await sendJson('/server-requests', 'POST', {
                community_name: communityName.trim(),
                icon_url: iconUrl.trim() || null,
                servers: parsedServers,
                game_type: gameType,
                elaboration: elaboration.trim() || null,
            });
            toast.success('Server request submitted!', {
                description: 'Thank you! We\'ll review your request soon.',
            });
            handleClose();
        } catch (error: any) {
            toast.error('Failed to submit request', {
                description: error?.message || 'Please try again later.',
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            {loginDialog}
            <Dialog open={open} onOpenChange={isOpen => !isOpen && handleClose()}>
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Request a Server</DialogTitle>
                        <DialogDescription>
                            Know a great ZE server we should track? Submit it here and we'll review it.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-5 py-2">
                        <Field label="Community Name" htmlFor="communityName" required>
                            <Input
                                id="communityName"
                                placeholder="e.g. GFL"
                                value={communityName}
                                onChange={e => setField('communityName')(e.target.value)}
                                maxLength={100}
                            />
                        </Field>

                        <Field label="Community Icon URL" htmlFor="iconUrl">
                            <Input
                                id="iconUrl"
                                placeholder="https://example.com/icon.png"
                                value={iconUrl}
                                onChange={e => setField('iconUrl')(e.target.value)}
                            />
                        </Field>

                        <Field label="Game" htmlFor="gameType" required>
                            <Select value={gameType} onValueChange={setField('gameType')}>
                                <SelectTrigger id="gameType">
                                    <SelectValue placeholder="Select a game" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cs2">CS2</SelectItem>
                                    <SelectItem value="csgo">CS:GO</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>

                        <Field label="Servers" required>
                            <div className="space-y-2">
                                {servers.map((server, index) => (
                                    <div key={index} className="flex gap-2 items-start">
                                        <div className="flex-1 grid gap-1.5">
                                            <Input
                                                placeholder="IP:Port (e.g. 192.168.1.1:27015)"
                                                value={server.ipPort}
                                                onChange={e => updateServer(index, 'ipPort', e.target.value)}
                                            />
                                            <Input
                                                placeholder="Readable link (e.g. gfl-ze, max 20 chars)"
                                                value={server.readableLink}
                                                onChange={e => updateServer(index, 'readableLink', e.target.value)}
                                                maxLength={20}
                                            />
                                        </div>
                                        {servers.length > 1 && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setServers(prev => prev.filter((_, i) => i !== index))}
                                                className="mt-1 text-muted-foreground hover:text-destructive flex-shrink-0"
                                                type="button"
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setServers(prev => [...prev, EMPTY_SERVER])}
                                type="button"
                                className="w-fit"
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                Add Server
                            </Button>
                        </Field>

                        <Field label="Elaboration" htmlFor="elaboration">
                            <Textarea
                                id="elaboration"
                                placeholder="Anything else we should know about this server or community?"
                                value={elaboration}
                                onChange={e => setField('elaboration')(e.target.value)}
                                rows={3}
                                maxLength={1000}
                            />
                            <p className="text-xs text-muted-foreground">{elaboration.length}/1000</p>
                        </Field>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={handleClose} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button onClick={handleSubmit} disabled={submitting}>
                            {submitting ? 'Submitting…' : 'Submit Request'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
