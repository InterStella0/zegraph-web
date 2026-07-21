'use client'
import { Button } from "components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "components/ui/tooltip";

export default function IconLink({ href, ariaLabel, icon, tooltip }){
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        asChild
                    >
                        <a
                            href={href}
                            aria-label={ariaLabel}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="transition-all duration-200 hover:-translate-y-0.5"
                        >
                            {icon}
                        </a>
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{tooltip}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};
