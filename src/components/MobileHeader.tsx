import { Link } from 'react-router-dom';

export function MobileHeader({ title, onMenuClick }: { title: string; onMenuClick: () => void }) {
  return (
    <header className="md:hidden bg-surface border-b border-outline-variant flex justify-between items-center w-full h-16 px-6 z-10 sticky top-0 shrink-0">
      <h1 className="text-headline-md font-bold text-primary">{title}</h1>
      <div className="flex items-center gap-2">
        <button className="text-on-surface-variant hover:text-primary transition-colors p-2" onClick={onMenuClick}>
          <span className="material-symbols-outlined">menu</span>
        </button>
      </div>
    </header>
  );
}
