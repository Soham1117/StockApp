'use client';

import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ProfileDropdown } from './profile-dropdown';
import { GlobalSearch } from './global-search';
import { SidebarNav } from './sidebar-nav';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

const pageTitles: Record<string, string> = {
  '/': 'Market Overview',
  '/portfolio': 'Portfolio',
  '/saved-screens': 'Saved Screens',
  '/profile': 'Profile',
};

interface AppHeaderProps {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export function AppHeader({ isCollapsed, setIsCollapsed }: AppHeaderProps) {
  const pathname = usePathname();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const pageTitle = pathname.startsWith('/industry/') ? 'Industry Analysis' : (pageTitles[pathname] || 'QuantDash');

  return (
    <>
      {/* Desktop Sidebar */}
      {isDesktop && <SidebarNav isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />}

      {/* Darkened Overlay when sidebar is expanded */}
      {isDesktop && !isCollapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
          onClick={() => setIsCollapsed(true)}
        />
      )}

      <header className={`border-b border-border bg-card sticky top-0 z-30 ${isDesktop ? 'lg:ml-16' : ''}`}>
        <div className="w-full px-2 py-1.5">
          <div className="flex items-center justify-between">
            {/* Left: Hamburger (mobile/tablet) or Logo (desktop) */}
            <div className="flex items-center gap-4">
              {!isDesktop && (
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-64 p-0">
                    <div className="p-4 border-b border-border">
                      <h2 className="text-lg font-semibold">Menu</h2>
                    </div>
                    <nav className="p-4 space-y-2">
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => (window.location.href = '/')}
                      >
                        RRG
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => (window.location.href = '/portfolio')}
                      >
                        Portfolio
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => window.location.href = '/industry/Technology/analysis'}
                      >
                        Industry Analysis
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => window.location.href = '/saved-screens'}
                      >
                        Saved Screens
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => window.location.href = '/profile'}
                      >
                        Profile
                      </Button>
                    </nav>
                  </SheetContent>
                </Sheet>
              )}
              
              <div>
                <h1 className="text-xl font-bold text-primary">QuantDash</h1>
                {!isDesktop && (
                  <p className="text-xs text-muted-foreground">{pageTitle}</p>
                )}
              </div>
            </div>

            {/* Center: Page Title (desktop only) */}

            {/* Right: Search (desktop) + Profile */}
            <div className="flex items-center gap-2">
              {isDesktop && <GlobalSearch />}
              <ProfileDropdown />
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

