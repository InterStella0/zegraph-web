import jwt from 'jsonwebtoken';
import type {
    GetServerSidePropsContext,
    NextApiRequest,
    NextApiResponse,
} from "next"
import type {AuthOptions, Session} from "next-auth"
import {getServerSession} from "next-auth"
import Steam from "next-auth-steam"
import {NextRequest} from "next/server";
import {STEAM_PROVIDER_ID} from "next-auth-steam";
import {BACKEND_DOMAIN} from "utils/generalUtils.ts";
import {SteamProfile} from "./next-auth-steam/steam.ts";

// Custom session type that extends NextAuth Session
export interface SteamSession extends Session {
    user: {
        steam: SteamProfile;
    } & Session["user"];
    backendJwt: string;
    isBanned?: boolean;
    banReason?: string | null;
}

export function getAuthOptions(req?: NextRequest): AuthOptions {
    return {
        providers: req
            ? [
                Steam(req, {
                    clientSecret: process.env.STEAM_SECRET!,
                    userinfo: {
                        // @ts-expect-error
                        async request(ctx) {
                            const temp_token = jwt.sign(
                                {
                                    sub: ctx.tokens.steamId,
                                    type: 'access',
                                    name: "Unknown",
                                    iss: "ze-graph",
                                },
                                process.env.NEXTAUTH_SECRET,
                                {expiresIn: '3m'}
                            );

                            try {
                                const response = await fetch(BACKEND_DOMAIN + '/accounts/me', {
                                    headers: {
                                        "Authorization": `Bearer ${temp_token}`
                                    }
                                })

                                const responseJson = await response.json()

                                let profile: SteamProfile | PromiseLike<SteamProfile>;
                                if (responseJson.code === 404){
                                    const responseCreate = await fetch(BACKEND_DOMAIN + '/accounts/create', {
                                        method: "POST",
                                        headers: {
                                            "Authorization": `Bearer ${temp_token}`
                                        }
                                    })
                                    const jsonResponse = await responseCreate.json()
                                    if (jsonResponse.msg === "OK")
                                        profile = jsonResponse.data
                                    else if (jsonResponse.code === 409){
                                        const responseGet = await fetch(BACKEND_DOMAIN + '/accounts/me', {
                                            headers: {
                                                "Authorization": `Bearer ${temp_token}`
                                            }
                                        })
                                        const result = await responseGet.json()
                                        profile = result.data
                                    } else{
                                        throw new Error(`FAILED TO CREATE ACCOUNT ${JSON.stringify(jsonResponse)}`)
                                    }
                                }else{
                                    profile = responseJson.data
                                }

                                // Fetch ban status
                                try {
                                    const banResponse = await fetch(BACKEND_DOMAIN + '/accounts/me/guide-ban', {
                                        headers: {
                                            "Authorization": `Bearer ${temp_token}`
                                        }
                                    })
                                    const banData = await banResponse.json()
                                    if (banData.data) {
                                        (profile as SteamProfile).is_banned = banData.data.is_banned ?? false;
                                        (profile as SteamProfile).ban_reason = banData.data.reason ?? null;
                                    }
                                } catch (banError) {
                                    (profile as SteamProfile).is_banned = false;
                                    (profile as SteamProfile).ban_reason = null;
                                    console.error("Failed to fetch ban status", banError)
                                }

                                return profile
                            }catch (e){
                                console.error(e)
                                throw e
                            }
                        }
                    },
                })
            ]
            : [],
        callbacks: {
            jwt({ token, account, profile }) {
                if (account?.provider === STEAM_PROVIDER_ID) {
                    token.steam = profile
                }
                const now = Math.floor(Date.now() / 1000);
                // @ts-expect-error
                const expiresIn = Math.max(token.exp ?? 0 - now, 60);
                token.backendJwt = jwt.sign(
                    {
                        sub: token.sub,
                        type: 'access',
                        name: token.name,
                        iss: "ze-graph",
                    },
                    process.env.NEXTAUTH_SECRET,
                    { expiresIn }
                );

                return token
            },
            session({ session, token }) {
                if ('steam' in token) {
                    // @ts-expect-error
                    session.user.steam = token.steam
                    // @ts-expect-error
                    session.isBanned = token.steam?.is_banned ?? false
                    // @ts-expect-error
                    session.banReason = token.steam?.ban_reason ?? null
                }
                // @ts-expect-error
                session.backendJwt = token.backendJwt
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