export interface DiscordUser {
    id: string;
    global_name: string;
    avatar?: string | null;
}
export interface SteamUser {
    id: string;
}
export interface Account {
    id: string;
    name: string;
    associated: Array<DiscordUser | SteamUser>
}