import UserProfile from "components/users/UserProfile";
import UserCommunityConnections from "components/users/UserCommunityConnections";
import ProfileOverview from "components/users/ProfileOverview";
import ProfileStatsCards from "components/users/ProfileStatsCards";
import getServerUser from "../../../getServerUser";
import { redirect } from "next/navigation";
import { ProfileResponse } from "types/community.ts";
import { fetchApiUrl } from "utils/generalUtils.ts";
import ResponsiveAppBar from "components/ui/ResponsiveAppBar.tsx";
import Footer from "components/ui/Footer";
import * as React from "react";

export default async function Page({ params }: { params: Promise<{ user_id: string }> }) {
    const { user_id } = await params;

    if (user_id === "me" && !await getServerUser()) {
        redirect('/');
    }

    const sessionUserPromise = getServerUser();
    const profilePromise: Promise<ProfileResponse> = fetchApiUrl(`/accounts/${user_id}/profile`);

    return (<>
        <ResponsiveAppBar userPromise={sessionUserPromise} server={null} setDisplayCommunity={null} />
        <div className="container mx-auto max-w-7xl px-4 py-8">
            <div className="flex flex-col gap-6">
                <UserProfile profilePromise={profilePromise} />
                <ProfileOverview userId={user_id} />
                <ProfileStatsCards userId={user_id} profilePromise={profilePromise} />
                <UserCommunityConnections profilePromise={profilePromise} />
            </div>
        </div>
        <Footer />
    </>)
}
