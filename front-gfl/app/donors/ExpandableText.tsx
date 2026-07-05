'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface ExpandableTextProps {
  text: string;
  clampClassName: string;
  className?: string;
}

export function ExpandableText({ text, clampClassName, className = '' }: ExpandableTextProps) {
  const t = useTranslations('donors');
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setIsTruncated(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
  }, [text]);

  return (
    <div>
      <p ref={ref} className={`${className} ${expanded ? '' : clampClassName}`}>
        {text}
      </p>
      {isTruncated && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-primary hover:underline"
        >
          {expanded ? t('showLess') : t('showMore')}
        </button>
      )}
    </div>
  );
}
