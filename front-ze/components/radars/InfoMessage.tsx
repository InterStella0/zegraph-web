import {MouseEvent, useState} from 'react';
import { Alert, AlertDescription } from 'components/ui/alert';
import { Button } from 'components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/ui/tooltip';
import { Info, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {useReactControl} from "./leafletControls";

const STORAGE_KEY = 'infoMessage';

function RenderedInfoMessage() {
    const t = useTranslations('radar');
    const [isExpanded, setIsExpanded] = useState(() => localStorage.getItem(STORAGE_KEY) !== "collapsed");
    const toggle = (e: MouseEvent) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
        localStorage.setItem(STORAGE_KEY, isExpanded ? "collapsed" : "expanded");
    };

    return isExpanded ? (
        <div className="rounded overflow-hidden shadow-md">
            <Alert className="w-[280px] card-solid">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm pr-8">
                    {t('infoDefault')}
                </AlertDescription>
                <Button variant="outline" size="icon" className="absolute top-2 right-2 h-6 w-6" onClick={toggle}>
                    <X className="h-4 w-4 text-primary" />
                </Button>
            </Alert>
        </div>
    ) : (
        <div className="m-1 rounded-full shadow-md overflow-hidden w-auto">
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="m-0.5 h-8 w-8 rounded-full bg-background hover:bg-accent" onClick={toggle}>
                        <Info className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{t('showInfo')}</p>
                </TooltipContent>
            </Tooltip>
        </div>
    )
}

export default function InfoMessage() {
    useReactControl(<RenderedInfoMessage />, 'topleft');
    return null;
}
