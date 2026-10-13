'use client'
import {ComponentProps, ReactNode} from "react";
import {Circle, Gamepad2, Info, Search} from "lucide-react";
import {Card, CardContent, CardHeader} from "components/ui/card";
import {Input} from "components/ui/input";
import {Button} from "components/ui/button";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "components/ui/tooltip";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {PlayerAvatar} from "./PlayerAvatar.tsx";
import {PlayerName} from "./PlayerName";

export function SearchField(props: ComponentProps<typeof Input>) {
    return (
        <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
            <Input {...props} className="pl-10"/>
        </div>
    );
}

export function OnlinePlayersCard({ className, title, info, search, children }: {
    className: string, title: ReactNode, info: string, search: ComponentProps<typeof Input>, children: ReactNode,
}) {
    return (
        <Card className={className}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                    <Gamepad2 className="w-5 h-5 text-primary"/>
                    <h2 className="text-lg max-sm:text-md font-semibold">
                        {title}
                    </h2>
                </div>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Info className="w-4 h-4"/>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{info}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </CardHeader>
            <CardContent className="pt-0">
                <SearchField {...search}/>
                {children}
            </CardContent>
        </Card>
    );
}

type OnlinePlayer = { id: string, name: string, is_anonymous?: boolean, hidden_from_others?: boolean };

export function OnlinePlayerRow({ player, href, playingFor, children }: {
    player: OnlinePlayer, href: string | null, playingFor: string, children?: ReactNode,
}) {
    const name = <PlayerName
        name={player.name}
        isAnonymous={player.is_anonymous}
        hiddenFromOthers={player.hidden_from_others}
        className={href ? undefined : "text-sm font-medium truncate block"}
    />;
    return (
        <div className="py-1 rounded-md transition-all duration-200 flex items-center gap-3">
            <div className="relative flex-shrink-0">
                <PlayerAvatar uuid={player.id} name={player.name}/>
                <Circle
                    className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full"
                    style={{color: 'hsl(var(--success))'}}
                    fill="currentColor"
                />
            </div>
            <div className="flex-1 min-w-0">
                {href ? (
                    <HoverPrefetchLink href={href} className="text-sm font-medium hover:underline block truncate">
                        {name}
                    </HoverPrefetchLink>
                ) : name}
                <p className="text-xs text-muted-foreground">
                    {playingFor}
                </p>
            </div>
            {children}
        </div>
    );
}
