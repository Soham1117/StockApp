'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Home, Bookmark, User, ChevronLeft, ChevronRight, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'RRG', icon: Activity },
  { path: '/portfolio', label: 'Portfolio', icon: Home },
  { path: '/saved-screens', label: 'Saved Screens', icon: Bookmark },
  { path: '/profile', label: 'Profile', icon: User },
];

interface SidebarNavProps {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export function SidebarNav({ isCollapsed, setIsCollapsed }: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col fixed left-0 top-0 h-full bg-card border-r border-border transition-all duration-300 z-50',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Collapse Toggle */}
      <div className="flex items-center justify-end p-2 border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="h-8 w-8"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;
          
          return (
            <Button
              key={item.path}
              variant={isActive ? 'secondary' : 'ghost'}
              className={cn(
                'w-full justify-start gap-3',
                isCollapsed && 'justify-center px-0'
              )}
              onClick={() => router.push(item.path)}
            >
              <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-primary')} />
              {!isCollapsed && (
                <span className={cn(isActive && 'font-semibold')}>{item.label}</span>
              )}
            </Button>
          );
        })}
      </nav>
    </aside>
  );
}
