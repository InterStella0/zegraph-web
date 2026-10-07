import { Info, X } from 'lucide-react';
import { Alert, AlertDescription } from 'components/ui/alert';
import { Button } from 'components/ui/button';
import { AnnouncementMarkdown } from './AnnouncementMarkdown';

interface AnnouncementBannerProps {
  text: string;
  onDismiss?: () => void;
  counter?: string;
}

export function AnnouncementBanner({ text, onDismiss, counter }: AnnouncementBannerProps) {
  return (
    <Alert variant="default" className="pr-12">
      <Info />
      <AlertDescription className="flex flex-wrap items-baseline gap-x-2">
        <AnnouncementMarkdown content={text} inline className="break-words" />
        {counter && <span className="text-xs tabular-nums text-muted-foreground">{counter}</span>}
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDismiss}
        className="absolute right-2 top-2 h-6 w-6"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </Alert>
  );
}
