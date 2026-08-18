import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  attributes: {
    ...defaultSchema.attributes,
    h1: ['id', 'className'],
    h2: ['id', 'className'],
    h3: ['id', 'className'],
  }
};


export function AnnouncementMarkdown({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
    >
      {content}
    </Markdown>
  );
}
