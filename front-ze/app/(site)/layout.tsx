import ResponsiveAppBar from "components/ui/ResponsiveAppBar.tsx";
import getServerUser from "app/getServerUser.ts";
import Footer from "components/ui/Footer.tsx";

export default function SiteLayout({ children }){
    const userPromise = getServerUser()
    return <div className="flex flex-1 flex-col">
        <ResponsiveAppBar userPromise={userPromise} server={null} setDisplayCommunity={null} />
        <div className="flex-1">
            {children}
        </div>
        <Footer />
    </div>
}
