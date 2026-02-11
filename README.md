# QuantDash - Stock Research Terminal

A Bloomberg-inspired stock screening and valuation dashboard built with Next.js 14, TypeScript, and Tailwind CSS.

## Features

- **Industry-Based Screening**: Select from dozens of industries to analyze stocks
- **Market Cap Classification**: View stocks grouped by Large Cap ($10B+), Mid Cap ($2B-$10B), and Small Cap ($300M-$2B)
- **Growth vs Value Analysis**: Automatic classification of stocks based on valuation metrics
- **Comprehensive Metrics**: P/E, P/S, P/B, EV/EBIT, EV/EBITDA ratios with industry comparisons
- **News Integration**: Recent and historical company news from Finnhub
- **Relative Rotation Graph (RRG)**: Visual representation of stock momentum vs benchmark
- **Custom Stock Addition**: Add your own stocks to compare against industry peers
- **Research Package View**: Detailed stock analysis with all metrics and news in one place

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Charts**: Recharts
- **Data Fetching**: TanStack Query (React Query)
- **APIs**:
  - DefeatBeta - Stock data & fundamentals
  - Finnhub - Company news

## Prerequisites

- Node.js 18+
- npm or yarn
- API Keys:
  - [Finnhub](https://finnhub.io/register) (free tier available)

## Setup

### 1. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 2. Configure Environment Variables

Copy the example environment file:

\`\`\`bash
cp .env.example .env.local
\`\`\`

Edit `.env.local` and add your API key:

\`\`\`env
FINNHUB_API_KEY=your_finnhub_api_key_here
FASTAPI_BASE_URL=http://localhost:8000
SEC_USER_AGENT="Your Name (your-email@example.com)"
\`\`\`

**Important**:
- Finnhub free tier provides 250 API calls/day
- DefeatBeta data is accessed via the FastAPI wrapper

### 3. Run Development Server

\`\`\`bash
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### 1. Select an Industry

Use the dropdown in the header to select an industry (e.g., "Software - Application", "Semiconductors", etc.)

### 2. View Stocks by Market Cap

Toggle between Large, Mid, and Small cap buckets in the left panel to see different stocks.

### 3. Analyze Metrics

- **Stocks Table**: View stock symbols, market cap, Growth/Value classification, and key ratios
- **Valuation Charts**: Compare stocks across different metrics with industry averages
- **RRG Chart**: See relative strength and momentum of stocks vs SPY benchmark

### 4. Get Detailed Research

Click any stock in the table to open the detailed research drawer with:
- **Overview**: Investment summary with Growth/Value classification and reasoning
- **Metrics**: All valuation ratios with industry comparison
- **News**: Recent (3 months) and historical (1 year) news articles

### 5. Add Custom Stocks

Click "Add Custom Stock" in the left panel to add any US stock to your analysis by symbol.

## API Rate Limits & Caching

QuantDash is optimized for free API tiers through aggressive caching:

- **Industries**: Cached for 24 hours
- **Stocks**: Cached for 12 hours
- **Metrics**: Cached for 12 hours
- **News**: Cached for 6 hours
- **RRG**: Cached for 1 hour

With this caching strategy, you can run multiple analyses per day without exceeding free tier limits (250 calls/day).

## Project Structure

\`\`\`
src/
├── app/
│   ├── api/              # API routes
│   │   ├── industry/     # Industry-specific endpoints
│   │   ├── meta/         # Metadata (industries list)
│   │   ├── rrg/          # Relative Rotation Graph
│   │   └── stocks/       # Stock-specific endpoints
│   ├── page.tsx          # Main dashboard page
│   └── layout.tsx        # Root layout
├── components/
│   ├── ui/               # shadcn/ui components
│   ├── industry-selector.tsx
│   ├── stocks-dashboard.tsx
│   ├── stocks-table.tsx
│   ├── metrics-charts.tsx
│   ├── stock-details-drawer.tsx
│   └── add-stock-dialog.tsx
├── hooks/
│   ├── use-industries.ts
│   └── use-stocks.ts     # React Query hooks
├── lib/
│   ├── cache.ts          # Server-side caching
│   ├── classification.ts # Growth/Value algorithm
│   ├── env.ts            # Environment validation
│   └── utils.ts          # Utilities
├── types/
│   └── index.ts          # TypeScript types
└── providers/
    └── query-provider.tsx
\`\`\`

## Growth vs Value Classification

Stocks are automatically classified as Growth, Value, or Blend based on:

### Growth Indicators (+score):
- High P/E ratio
- High P/S ratio
- High P/B ratio
- Low/no dividend yield
- High revenue growth (>20%)

### Value Indicators (-score):
- Low P/E ratio
- Low P/B ratio
- Low P/S ratio
- High dividend yield
- Low revenue growth (<5%)

Score range: -100 (strong value) to +100 (strong growth)
- Score > 30: **Growth**
- Score < -30: **Value**
- Score -30 to 30: **Blend**

## Building for Production

\`\`\`bash
npm run build
npm start
\`\`\`

## Troubleshooting

### API Key Errors

If you see "API key not configured" errors:
1. Verify `.env.local` file exists in project root
2. Confirm all three keys are set correctly
3. Restart the dev server after adding keys

### No Data for Industry

Some niche industries may have limited US stocks. Try selecting a major industry like:
- Software - Application
- Semiconductors
- Banks - Regional
- Oil & Gas E&P

### Rate Limit Exceeded

If you hit rate limits:
1. Wait 24 hours for free tier reset
2. Clear cache by restarting the server
3. Consider upgrading to paid API tier for production use

## License

MIT

## Credits

Built with ❤️ using:
- [Next.js](https://nextjs.org/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Recharts](https://recharts.org/)
- [DefeatBeta](https://github.com/JustinGoheen/defeatbeta)
- [Finnhub](https://finnhub.io/)
