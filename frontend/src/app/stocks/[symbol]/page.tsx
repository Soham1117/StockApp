import { notFound } from 'next/navigation';
import { StockDetailsPageClient } from '@/components/stock-details-page-client';

interface PageProps {
  params: Promise<{ symbol: string }>;
}

export default async function StockPage(props: PageProps) {
  const { symbol } = await props.params;
  const upperSymbol = symbol.toUpperCase();

  // Fetch stock data
  let stockData;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/stocks/${upperSymbol}`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      if (res.status === 404) {
        notFound();
      }
      throw new Error(`Failed to fetch stock: ${res.status}`);
    }

    stockData = await res.json();
  } catch (error) {
    console.error('[Page] Error fetching stock:', error);
    notFound();
  }

  return <StockDetailsPageClient symbol={upperSymbol} initialStock={stockData.stock} sector={stockData.sector} />;
}

export async function generateMetadata(props: PageProps) {
  const { symbol } = await props.params;
  const upperSymbol = symbol.toUpperCase();

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/stocks/${upperSymbol}`, {
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      return {
        title: `${upperSymbol} - ${data.stock.companyName} | QuantDash`,
        description: `Stock research and analysis for ${upperSymbol} (${data.stock.companyName}). View metrics, news, financials, and more.`,
      };
    }
  } catch (error) {
    // Fallback metadata
  }

  return {
    title: `${upperSymbol} | QuantDash`,
    description: `Stock research and analysis for ${upperSymbol}`,
  };
}

