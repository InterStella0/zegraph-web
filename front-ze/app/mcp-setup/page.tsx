import { Metadata } from 'next';
import { Bot } from 'lucide-react';
import ResponsiveAppBar from 'components/ui/ResponsiveAppBar';
import Footer from 'components/ui/Footer';
import McpSetupClient from 'components/mcp/McpSetupClient';
import getServerUser from '../getServerUser';
import { DOMAIN, formatTitle } from 'utils/generalUtils';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    title: formatTitle(t('mcpTitle')),
    description: t('mcpDescription'),
    alternates: { canonical: '/mcp-setup' },
  };
}

const MCP_URL = `${DOMAIN}/mcp`;

export default async function McpSetupPage() {
  const t = await getTranslations('mcp');
  const user = getServerUser();

  return (
      <>
        <ResponsiveAppBar userPromise={user} server={null} setDisplayCommunity={null} />

        <div className="min-h-screen py-12 px-4">
          <div className="container mx-auto max-w-5xl space-y-8">

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Bot className="w-6 h-6 text-primary" />
                <h1 className="text-3xl font-bold">{t('title')}</h1>
              </div>
              <p className="text-muted-foreground">{t('description')}</p>
            </div>

            <McpSetupClient mcpUrl={MCP_URL} />

          </div>
        </div>

        <Footer />
      </>
  );
}
