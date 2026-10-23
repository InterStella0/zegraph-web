import jwt from 'jsonwebtoken';
import type {GetServerSidePropsContext, NextApiRequest, NextApiResponse} from "next"
import type {AuthOptions, Session} from "next-auth"
import {getServerSession} from "next-auth"
import Steam, {STEAM_PROVIDER_ID} from "next-auth-steam"
import {NextRequest} from "next/server";
import {BACKEND_DOMAIN} from "utils/generalUtils.ts";
import {SteamProfile} from "types/steam";

export interface SteamSession extends Session {
    user: {
        steam: SteamProfile;
    } & Session["user"];
    backendJwt: string;
    isBanned?: boolean;
    banReason?: string | null;
}

const signBackendJwt = (sub: string, name: string, expiresIn: jwt.SignOptions["expiresIn"]) =>
    jwt.sign({ sub, type: 'access', name, iss: "ze-graph" }, process.env.NEXTAUTH_SECRET, { expiresIn });

const backendJson = async (path: string, token: string, init: RequestInit = {}) =>
    (await fetch(BACKEND_DOMAIN + path, { ...init, headers: { "Authorization": `Bearer ${token}` } })).json();

async function fetchOwnProfile(steamId: string): Promise<SteamProfile | null> {
    const token = signBackendJwt(steamId, "Unknown", '3m');
    try {
        const result = await backendJson('/accounts/me', token, { cache: 'no-store' })
        return result.msg === "OK" ? result.data : null
    } catch (e) {
        console.error('Failed to refresh Steam profile:', e)
        return null
    }
}

/** Loads the signed-in Steam user's account, creating it on first sign-in. */
async function fetchOrCreateProfile(steamId: string): Promise<SteamProfile> {
    const token = signBackendJwt(steamId, "Unknown", '3m');
    try {
        const me = await backendJson('/accounts/me', token)
        if (me.code !== 404) return me.data
        const created = await backendJson('/accounts/create', token, { method: "POST" })
        if (created.msg === "OK") return created.data
        // 409: the account already exists, e.g. created by a concurrent sign-in.
        if (created.code === 409) return (await backendJson('/accounts/me', token)).data
        throw new Error(`FAILED TO CREATE ACCOUNT ${JSON.stringify(created)}`)
    } catch (e) {
        console.error(e)
        throw e
    }
}

export function getAuthOptions(req?: NextRequest): AuthOptions {
    return {
        providers: req
            ? [
                Steam(req, {
                    clientSecret: process.env.STEAM_SECRET!,
                    userinfo: {
                        request: (ctx) => fetchOrCreateProfile(ctx.tokens.steamId as string),
                    },
                })
            ]
            : [],
        callbacks: {
            async jwt({ token, account, profile, trigger }) {
                if (account?.provider === STEAM_PROVIDER_ID) {
                    token.steam = profile
                }
                // The Steam profile is copied into the token once at sign-in. SteamProfileRefresher
                // asks for an update so a changed name or avatar reaches the navbar.
                if (trigger === "update" && token.steam && token.sub) {
                    const fresh = await fetchOwnProfile(token.sub)
                    if (fresh) token.steam = fresh
                }
                const now = Math.floor(Date.now() / 1000);
                const expiresIn = Math.max(((token.exp as number) ?? 0) - now, 60);
                token.backendJwt = signBackendJwt(token.sub, token.name, expiresIn);
                return token
            },
            session({ session, token }) {
                const steamSession = session as SteamSession
                if ('steam' in token) {
                    const steam = token.steam as SteamProfile
                    steamSession.user.steam = steam
                    steamSession.isBanned = steam?.is_banned ?? false
                    steamSession.banReason = steam?.ban_reason ?? null
                }
                steamSession.backendJwt = token.backendJwt as string
                return session
            }
        }
    }
}

export function auth(
    ...args:
        | [GetServerSidePropsContext["req"], GetServerSidePropsContext["res"]]
        | [NextApiRequest, NextApiResponse]
        | []
): Promise<SteamSession | null> {
    const req = args[0] && args[0] instanceof NextRequest ? args[0] : null;
    return getServerSession(...args, getAuthOptions(req)) as Promise<SteamSession | null>
}
