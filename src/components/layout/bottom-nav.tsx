'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Activity, Bookmark, User, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'RRG', icon: Activity },
  { path: '/portfolio', label: 'Portfolio', icon: Home },
  { path: '/saved-screens', label: 'Saved', icon: Bookmark },
  { path: '/profile', label: 'Profile', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card lg:hidden pb-[env(safe-area-inset-bottom,0px)]">
      <div className="grid grid-cols-4 h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;
          
          const iconClass = cn(
            'h-5 w-5',
            isActive ? 'text-primary-foreground' : 'text-muted-foreground'
          );
          const labelClass = cn(
            'text-xs',
            isActive ? 'text-primary-foreground font-semibold' : 'text-muted-foreground'
          );

          return (
            <Button
              key={item.path}
              variant="ghost"
              className={cn(
                'flex flex-col items-center justify-center gap-1 h-full rounded-none text-muted-foreground',
                isActive && 'text-primary-foreground bg-accent font-semibold'
              )}
              onClick={() => router.push(item.path)}
            >
              <Icon className={iconClass} />
              <span className={labelClass}>{item.label}</span>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
