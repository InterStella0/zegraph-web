import React from 'react';

interface ScreenReaderOnlyProps {
  children: React.ReactNode;
  id?: string;
  as?: 'div' | 'span' | 'p' | 'section';
}

/**
 * Component that renders content only visible to screen readers.
 * Uses Tailwind's sr-only class for accessibility.
 */
export function ScreenReaderOnly({
  children,
  id,
  as: Component = 'div'
}: ScreenReaderOnlyProps) {
  return (
    <Component id={id} className="sr-only">
      {children}
    </Component>
  );
}
