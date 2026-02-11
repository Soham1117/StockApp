'use client';

import { useState } from 'react';
import { AppHeader } from './app-header';
import { BottomNav } from './bottom-nav';
import { useMediaQuery } from '@/hooks/use-media-query';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [isCollapsed, setIsCollapsed] = useState(true); // Minimized by default

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

      <main className={`flex-1 safe-area-bottom lg:pb-0 ${isDesktop ? 'lg:ml-16' : ''}`}>
        {children}
      </main>

      {/* Bottom Navigation - Mobile/Tablet only */}
      {!isDesktop && <BottomNav />}
    </div>
  );
}
