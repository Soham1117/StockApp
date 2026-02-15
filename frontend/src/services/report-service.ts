import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Helper to wrap text for PDF
 */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (current.length + word.length + 1 > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

/**
 * Generate a combined industry report PDF
 */
export async function generateIndustryReport(params: {
  industry: string;
  symbols: string[];
  baseUrl: string;
  title?: string;
  rankings?: Record<string, { rank?: number; total?: number }>;
}): Promise<Uint8Array> {
  const { industry, symbols, baseUrl, rankings = {} } = params;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const cover = pdfDoc.addPage();
  const { width, height } = cover.getSize();
  const margin = 40;
  let y = height - margin;

  const title = params.title || `Industry Report: ${industry}`;
  cover.drawText(title, {
    x: margin,
    y,
    size: 18,
    font: boldFont,
  });
  y -= 18 * 1.8;

  const dateStr = new Date().toISOString().slice(0, 10);
  cover.drawText(`Generated: ${dateStr}`, {
    x: margin,
    y,
    size: 11,
    font,
  });
  y -= 20;

  cover.drawText(`Symbols (${symbols.length}):`, {
    x: margin,
    y,
    size: 11,
    font: boldFont,
  });
  y -= 16;

  const symbolLine = symbols.join(', ');
  const lines = wrapText(symbolLine, 90);
  for (const line of lines) {
    cover.drawText(line, { x: margin, y, size: 10, font });
    y -= 14;
  }

  // Fetch individual reports in parallel (with limit)
  const CONCURRENCY_LIMIT = 5;
  const errors: string[] = [];

  for (let i = 0; i < symbols.length; i += CONCURRENCY_LIMIT) {
    const chunk = symbols.slice(i, i + CONCURRENCY_LIMIT);
    const results = await Promise.all(
      chunk.map(async (symbol) => {
        try {
          const reportUrl = new URL(`${baseUrl}/api/stocks/${encodeURIComponent(symbol)}/research-report/pdf`);
          const rankInfo = rankings[symbol];
          if (rankInfo?.rank && rankInfo?.total) {
            reportUrl.searchParams.set('rank', String(rankInfo.rank));
            reportUrl.searchParams.set('total', String(rankInfo.total));
          }

          const res = await fetch(reportUrl.toString(), { cache: 'no-store' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          
          const bytes = await res.arrayBuffer();
          return { symbol, bytes };
        } catch (err) {
          return { symbol, error: err instanceof Error ? err.message : String(err) };
        }
      })
    );

    for (const res of results) {
      if (res.bytes) {
        const sourceDoc = await PDFDocument.load(res.bytes);
        const pages = await pdfDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
        pages.forEach((page) => pdfDoc.addPage(page));
      } else {
        errors.push(`${res.symbol}: ${res.error}`);
      }
    }
  }

  if (errors.length > 0) {
    const errPage = pdfDoc.addPage();
    let errY = errPage.getSize().height - margin;
    errPage.drawText('Report generation errors', { x: margin, y: errY, size: 14, font: boldFont });
    errY -= 20;
    for (const line of errors) {
      errPage.drawText(`- ${line}`, { x: margin, y: errY, size: 10, font });
      errY -= 14;
    }
  }

  return await pdfDoc.save();
}
