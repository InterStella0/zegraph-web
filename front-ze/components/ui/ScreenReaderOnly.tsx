import {ReactNode} from 'react';

export function ScreenReaderOnly({ children, id, as: Component = 'div' }: {
  children: ReactNode;
  id?: string;
  as?: 'div' | 'span' | 'p' | 'section';
}) {
  return (
    <Component id={id} className="sr-only">
      {children}
    </Component>
  );
}
