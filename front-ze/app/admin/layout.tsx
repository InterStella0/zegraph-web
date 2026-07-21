import type { ReactNode } from 'react';
import { auth } from 'auth';
import type { SteamSession } from 'auth';
import Footer from 'components/ui/Footer';
import ResponsiveAppBar from 'components/ui/ResponsiveAppBar';
import getServerUser from '../getServerUser';
import AdminSidebar from './AdminSidebar';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = (await auth()) as SteamSession | null;

  const isSuperuser = !!session?.user?.steam?.is_superuser;
  const isMapManager = !!session?.user?.steam?.is_map_manager;

  if (!isSuperuser && !isMapManager) {
    return <div>Unauthorized</div>;
  }

  const user = getServerUser();

  return (
    <>
      <ResponsiveAppBar userPromise={user} server={null} setDisplayCommunity={null} />
      <div className="flex flex-col min-[769px]:flex-row min-h-screen">
        <AdminSidebar mapManagerOnly={!isSuperuser && isMapManager} />
        <main className="flex-1">
          <div className="container max-w-7xl mx-auto px-4 py-4">
            {children}
          </div>
        </main>
      </div>
      <Footer />
    </>
  );
}
