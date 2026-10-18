import React from 'react';

interface ScreenReaderOnlyProps {
  children: React.ReactNode;
  id?: string;
  as?: 'div' | 'span' | 'p' | 'section';
}

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
