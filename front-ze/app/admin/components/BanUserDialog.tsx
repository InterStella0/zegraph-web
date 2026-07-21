'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/ui/dialog';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Ban } from 'lucide-react';
import { fetchApiUrl } from 'utils/generalUtils';

export function BanUserDialog({
  isOpen,
  onClose,
  userId,
  userName,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  userName?: string | null;
  onSuccess: () => void;
}) {
  const [banUserId, setBanUserId] = useState(userId || '');
  const [banReason, setBanReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (userId) {
      setBanUserId(userId);
    }
  }, [userId]);

  const handleClose = () => {
    setBanReason('');
    if (!userId) {
      setBanUserId('');
    }
    onClose();
  };

  const handleBan = async () => {
    if (!banUserId || !banReason) return;

    setIsSubmitting(true);
    try {
      await fetchApiUrl(`/admin/users/${banUserId}/guide-ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: banReason }),
      });
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Failed to ban user:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ban User from Guides</DialogTitle>
          <DialogDescription>
            {userName
              ? `Ban ${userName} from creating guides and comments.`
              : 'Ban a user from creating guides and comments.'}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div>
            <label className="text-sm font-medium">Steam ID</label>
            <Input
              value={banUserId}
              onChange={(e) => setBanUserId(e.target.value)}
              placeholder="Enter Steam ID (e.g., 76561198012345678)"
              className="mt-2"
              disabled={!!userName}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Reason</label>
            <Input
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Enter ban reason..."
              className="mt-2"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleBan}
            disabled={!banReason || !banUserId || isSubmitting}
          >
            <Ban className="mr-2 h-4 w-4" />
            Ban User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
