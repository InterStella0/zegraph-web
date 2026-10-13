import ResponsiveAppBar from "components/ui/ResponsiveAppBar.tsx";
import getServerUser from "app/getServerUser.ts";
import Footer from "components/ui/Footer.tsx";

export default function SiteLayout({ children }){
    const userPromise = getServerUser()
    return <>
        <ResponsiveAppBar userPromise={userPromise} server={null} setDisplayCommunity={null} />
        {children}
        <Footer />
    </>
}
