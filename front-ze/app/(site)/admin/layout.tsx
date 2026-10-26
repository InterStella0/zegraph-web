import type { ReactNode } from 'react';
import { auth } from 'auth';
import AdminSidebar from './AdminSidebar';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const steam = (await auth())?.user?.steam;
  const isSuperuser = !!steam?.is_superuser;
  const isMapManager = !!steam?.is_map_manager;

  if (!isSuperuser && !isMapManager) {
    return <div>Unauthorized</div>;
  }

  return (
    <div className="flex flex-col min-[769px]:flex-row min-h-screen">
      <AdminSidebar mapManagerOnly={!isSuperuser && isMapManager} />
      <main className="flex-1">
        <div className="container max-w-7xl mx-auto px-4 py-4">
          {children}
        </div>
      </main>
    </div>
  );
}
