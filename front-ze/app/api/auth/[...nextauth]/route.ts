import NextAuth from "next-auth"
import {getAuthOptions} from "auth";
import {NextRequest} from "next/server";

const handler = async (req: NextRequest, ctx: { params: { nextauth: string[] } }) =>
    NextAuth(req, ctx, getAuthOptions(req))

export { handler as GET, handler as POST }
