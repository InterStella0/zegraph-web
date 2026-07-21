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
import { Input } from 'components/ui/input';
import { Textarea } from 'components/ui/textarea';
import { Button } from 'components/ui/button';
import { Label } from 'components/ui/label';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import LoginDialog from 'components/ui/LoginDialog';
import { fetchApiUrl } from 'utils/generalUtils';
import { SteamProfile } from '../../next-auth-steam/steam.ts';

interface ServerEntry {
    ipPort: string;
    readableLink: string;
}

interface RequestServerDialogProps {
    user: SteamProfile | null;
    open: boolean;
    onClose: () => void;
}

export default function RequestServerDialog({ user, open, onClose }: RequestServerDialogProps) {
    const [loginOpen, setLoginOpen] = useState(false);
    const [communityName, setCommunityName] = useState('');
    const [iconUrl, setIconUrl] = useState('');
    const [servers, setServers] = useState<ServerEntry[]>([{ ipPort: '', readableLink: '' }]);
    const [gameType, setGameType] = useState<string>('');
    const [elaboration, setElaboration] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleOpen = (isOpen: boolean) => {
        if (!isOpen) handleClose();
    };

    const handleClose = () => {
        if (submitting) return;
        setCommunityName('');
        setIconUrl('');
        setServers([{ ipPort: '', readableLink: '' }]);
        setGameType('');
        setElaboration('');
        onClose();
    };

    const addServer = () => {
        setServers(prev => [...prev, { ipPort: '', readableLink: '' }]);
    };

    const removeServer = (index: number) => {
        setServers(prev => prev.filter((_, i) => i !== index));
    };

    const updateServer = (index: number, field: keyof ServerEntry, value: string) => {
        setServers(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
    };

    const handleSubmit = async () => {
        if (!user) {
            onClose();
            setLoginOpen(true);
            return;
        }

        if (!communityName.trim()) {
            toast.error('Community name is required');
            return;
        }
        if (!gameType) {
            toast.error('Please select a game');
            return;
        }
        for (const s of servers) {
            if (!s.ipPort.trim()) {
                toast.error('All server IP:port fields must be filled in');
                return;
            }
            if (!s.readableLink.trim() || s.readableLink.length > 20) {
                toast.error('Readable link must be 1–20 characters');
                return;
            }
        }

        // Parse ip:port
        const parsedServers = [];
        for (const s of servers) {
            const lastColon = s.ipPort.lastIndexOf(':');
            if (lastColon === -1) {
                toast.error(`Invalid format "${s.ipPort}" — use IP:port`);
                return;
            }
            const ip = s.ipPort.slice(0, lastColon).trim();
            const port = parseInt(s.ipPort.slice(lastColon + 1).trim(), 10);
            if (!ip || isNaN(port) || port < 1 || port > 65535) {
                toast.error(`Invalid IP or port in "${s.ipPort}"`);
                return;
            }
            parsedServers.push({ ip, port, readable_link: s.readableLink.trim() });
        }

        setSubmitting(true);
        try {
            await fetchApiUrl('/server-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    community_name: communityName.trim(),
                    icon_url: iconUrl.trim() || null,
                    servers: parsedServers,
                    game_type: gameType,
                    elaboration: elaboration.trim() || null,
                }),
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
            <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />
            <Dialog open={open} onOpenChange={handleOpen}>
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Request a Server</DialogTitle>
                        <DialogDescription>
                            Know a great ZE server we should track? Submit it here and we'll review it.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-5 py-2">
                        {/* Community Name */}
                        <div className="grid gap-2">
                            <Label htmlFor="communityName">
                                Community Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="communityName"
                                placeholder="e.g. GFL"
                                value={communityName}
                                onChange={e => setCommunityName(e.target.value)}
                                maxLength={100}
                            />
                        </div>

                        {/* Community Icon URL */}
                        <div className="grid gap-2">
                            <Label htmlFor="iconUrl">Community Icon URL <span className="text-xs text-muted-foreground">(optional)</span></Label>
                            <Input
                                id="iconUrl"
                                placeholder="https://example.com/icon.png"
                                value={iconUrl}
                                onChange={e => setIconUrl(e.target.value)}
                            />
                        </div>

                        {/* Game Type */}
                        <div className="grid gap-2">
                            <Label htmlFor="gameType">
                                Game <span className="text-destructive">*</span>
                            </Label>
                            <Select value={gameType} onValueChange={setGameType}>
                                <SelectTrigger id="gameType">
                                    <SelectValue placeholder="Select a game" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cs2">CS2</SelectItem>
                                    <SelectItem value="csgo">CS:GO</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Servers */}
                        <div className="grid gap-2">
                            <Label>
                                Servers <span className="text-destructive">*</span>
                            </Label>
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
                                                onClick={() => removeServer(index)}
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
                                onClick={addServer}
                                type="button"
                                className="w-fit"
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                Add Server
                            </Button>
                        </div>

                        {/* Elaboration */}
                        <div className="grid gap-2">
                            <Label htmlFor="elaboration">
                                Elaboration <span className="text-xs text-muted-foreground">(optional)</span>
                            </Label>
                            <Textarea
                                id="elaboration"
                                placeholder="Anything else we should know about this server or community?"
                                value={elaboration}
                                onChange={e => setElaboration(e.target.value)}
                                rows={3}
                                maxLength={1000}
                            />
                            <p className="text-xs text-muted-foreground">{elaboration.length}/1000</p>
                        </div>
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
