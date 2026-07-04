import { Metadata } from 'next';
import { ExternalLink, Compass } from 'lucide-react';
import ResponsiveAppBar from 'components/ui/ResponsiveAppBar';
import Footer from 'components/ui/Footer';
import getServerUser from '../getServerUser';
import { URI, formatTitle } from 'utils/generalUtils';

export const metadata: Metadata = {
  title: formatTitle('Hub'),
  description:
    'A hub of Zombie Escape (ZE) community websites, tools, minigames and resources worth checking out.',
  alternates: { canonical: '/hub' },
};

interface CommunityLink {
  id: string;
  name: string;
  url: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

async function getLinks(): Promise<CommunityLink[]> {
  try {
    const res = await fetch(URI('/community-links'), { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data ?? [];
  } catch {
    return [];
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default async function HubPage() {
  const user = getServerUser();
  const links = await getLinks();

  return (
    <>
      <ResponsiveAppBar userPromise={user} server={null} setDisplayCommunity={null} />

      <div className="min-h-screen py-12 px-4">
        <div className="container mx-auto max-w-5xl space-y-10">

          {/* Page header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Compass className="w-6 h-6 text-primary" />
              <h1 className="text-3xl font-bold">ZE Community Hub</h1>
            </div>
            <p className="text-muted-foreground max-w-2xl">
              A collection of community websites, tools, minigames and resources from across the
              Zombie Escape community. Found something that belongs here? Let us know.
            </p>
          </div>

          {/* Links grid */}
          {links.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {links.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col gap-2 rounded-xl border border-border/50 bg-muted/20 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold leading-tight group-hover:text-primary transition-colors">
                      {link.name}
                    </h2>
                    <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {link.description && (
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {link.description}
                    </p>
                  )}
                  <span className="text-xs text-muted-foreground/70 font-mono mt-auto pt-1 truncate">
                    {hostOf(link.url)}
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground space-y-2">
              <p className="text-lg font-medium">Nothing here yet.</p>
              <p className="text-sm">Community links will show up here soon.</p>
            </div>
          )}

        </div>
      </div>

      <Footer />
    </>
  );
}
