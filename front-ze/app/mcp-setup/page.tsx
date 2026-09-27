import { Metadata } from 'next';
import { Bot } from 'lucide-react';
import ResponsiveAppBar from 'components/ui/ResponsiveAppBar';
import Footer from 'components/ui/Footer';
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

function Snippet({ title, hint, code }: { title: string, hint?: string, code: string }) {
  return (
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        <pre className="rounded-md border bg-muted/50 p-4 text-sm overflow-x-auto"><code>{code}</code></pre>
      </section>
  );
}

export default async function McpSetupPage() {
  const t = await getTranslations('mcp');
  const user = getServerUser();

  return (
      <>
        <ResponsiveAppBar userPromise={user} server={null} setDisplayCommunity={null} />

        <div className="min-h-screen py-12 px-4">
          <div className="container mx-auto max-w-3xl space-y-8">

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Bot className="w-6 h-6 text-primary" />
                <h1 className="text-3xl font-bold">{t('title')}</h1>
              </div>
              <p className="text-muted-foreground">{t('description')}</p>
            </div>

            <Snippet title={t('endpoint')} hint={t('endpointHint')} code={MCP_URL} />
            <Snippet
                title="Claude Code"
                code={`claude mcp add --transport http zegraph ${MCP_URL}`}
            />
            <Snippet
                title={t('otherClients')}
                hint={t('otherClientsHint')}
                code={JSON.stringify({ mcpServers: { zegraph: { type: 'http', url: MCP_URL } } }, null, 2)}
            />
            <Snippet
                title={t('inspect')}
                hint={t('inspectHint')}
                code={`npx @modelcontextprotocol/inspector --cli ${MCP_URL} --transport http --method tools/list`}
            />

            <p className="text-sm text-muted-foreground">
              {t.rich('apiDocsHint', {
                link: (chunks) => <a href="/data/api/ui" className="text-primary underline underline-offset-4">{chunks}</a>,
              })}
            </p>

          </div>
        </div>

        <Footer />
      </>
  );
}
