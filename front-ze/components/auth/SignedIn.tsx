'use client'
import {createContext, ReactNode, useContext} from "react";

const SignedInContext = createContext(false);

/**
 * Whether the visitor has a session cookie, decided once by the root layout so server and client
 * renders agree. It does not prove the session is still valid; a backend 401/403 on a login-only
 * route should still fall back to the locked state.
 */
export function SignedInProvider({ signedIn, children }: { signedIn: boolean, children: ReactNode }) {
    return <SignedInContext.Provider value={signedIn}>{children}</SignedInContext.Provider>;
}

export const useSignedIn = () => useContext(SignedInContext);
