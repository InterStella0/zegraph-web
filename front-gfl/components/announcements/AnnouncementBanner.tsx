'use client';

import { X } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from 'components/ui/alert';
import { Button } from 'components/ui/button';

interface AnnouncementBannerProps {
  id: string;
  text: string;
}

export function AnnouncementBanner({ id: _id, text }: AnnouncementBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <Alert className="rounded-none border-x-0 border-t-0 bg-primary/10 border-primary/20">
      <AlertDescription className="flex items-center justify-between gap-4">
        <span className="flex-1 text-sm">{text}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}
