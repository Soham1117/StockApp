'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Search, BarChart3, FileText } from 'lucide-react';
import { AddStockToPortfolioDialog } from './add-stock-dialog';

export function QuickLinksSection() {
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AddStockToPortfolioDialog />

          <Button
            variant="outline"
            onClick={() => router.push('/industry/Technology/analysis')}
            className="w-full justify-start"
          >
            <Search className="mr-2 h-4 w-4" />
            Industry Analysis
          </Button>

          <Button
            variant="outline"
            onClick={() => router.push('/saved-screens')}
            className="w-full justify-start"
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            Saved Screens
          </Button>

          <Button
            variant="outline"
            onClick={() => router.push('/profile')}
            className="w-full justify-start"
          >
            <FileText className="mr-2 h-4 w-4" />
            Export Portfolio
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
