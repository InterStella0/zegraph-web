'use client';

import {Avatar, AvatarFallback, AvatarImage} from "components/ui/avatar";
import {Button} from "components/ui/button";
import {Card, CardContent} from "components/ui/card";
import {Circle, Users, ChevronDown, ChevronUp} from "lucide-react";
import ServerCard from "./ServerCard";
import {getServerAvatarText} from "../ui/CommunitySelector";
import {useState} from "react";
import {useTranslations} from "next-intl";

const CommunityCard = ({ community }) => {
    const t = useTranslations('home');
    const [ isExpanded, setExpanded ] = useState(false);
    const maxServersToShow = 3;
    const serversToDisplay = isExpanded
        ? community.servers
        : community.servers.slice(0, maxServersToShow);
    const onToggleExpanded = () => setExpanded(e => !e)
    return (
        <Card>
            <CardContent className="p-4 sm:p-6">
                <div className="space-y-4 sm:space-y-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <Avatar className="w-10 h-10 sm:w-12 sm:h-12 font-bold">
                            <AvatarImage src={community.icon_url} alt={community.name} />
                            <AvatarFallback>
                                {getServerAvatarText(community.name)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-base sm:text-xl font-semibold text-left break-words leading-tight">
                                {community.name}
                            </h2>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-4 mt-1">
                                <div className="flex flex-row items-center gap-1">
                                    <Users className="h-4 w-4" />
                                    <span className="text-xs sm:text-sm">
                                        {t('playerCount', {count: community.players})}
                                    </span>
                                </div>
                                <div className="flex flex-row items-center gap-1">
                                    <Circle
                                        className={`h-2 w-2 ${community.status ? 'fill-green-500 text-green-500' : 'fill-red-500 text-red-500'}`}
                                    />
                                    <span className="text-xs sm:text-xs text-muted-foreground">
                                        {community.status ? t('online') : t('offline')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm sm:text-base font-medium mb-2">
                            {t('servers')}
                        </h3>
                        {serversToDisplay.map(server => (
                            <ServerCard
                                key={server.id}
                                server={server}
                            />
                        ))}

                        {community.servers.length > maxServersToShow && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onToggleExpanded}
                                className="mt-2 text-xs sm:text-sm font-medium"
                            >
                                {isExpanded ? (
                                    <>
                                        <ChevronUp className="mr-2 h-4 w-4" />
                                        {t('showLess')}
                                    </>
                                ) : (
                                    <>
                                        <ChevronDown className="mr-2 h-4 w-4" />
                                        {t('showMore', {count: community.servers.length - maxServersToShow})}
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
export default CommunityCard;