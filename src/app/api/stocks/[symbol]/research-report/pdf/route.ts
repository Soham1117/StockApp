import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

interface StockResearchReport {
  symbol: string;
  sector: string;
  industry: string;
  generatedAt: string;
  report: string;
  coverage?: {
    included: string[];
    missing: string[];
    notIncluded: string[];
  };
}

function splitTextIntoLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n');
}

function drawMarkdownLine(
  page: any,
  line: string,
  xStart: number,
  y: number,
  font: any,
  boldFont: any,
  fontSize: number,
  maxWidth: number
): number {
  // Simple **bold** parser per line
  const segments = line.split('**');
  let x = xStart;
  const lineHeight = fontSize * 1.4;

  for (let i = 0; i < segments.length; i++) {
    const text = segments[i];
    if (!text) continue;

    const isBold = i % 2 === 1;
    const currentFont = isBold ? boldFont : font;

    // Naive wrapping within the line: if exceeding width, move to next line
    const words = text.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = currentFont.widthOfTextAtSize(testLine, fontSize);

      if (x + width > maxWidth) {
        // Draw current line and move to next
        if (currentLine) {
          page.drawText(currentLine, {
            x,
            y,
            size: fontSize,
            font: currentFont,
          });
          y -= lineHeight;
          x = xStart;
        }
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      page.drawText(currentLine, {
        x,
        y,
        size: fontSize,
        font: currentFont,
      });
      x += currentFont.widthOfTextAtSize(currentLine, fontSize) + currentFont.widthOfTextAtSize(
        ' ',
        fontSize
      );
    }
  }

  return y - lineHeight;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function ensureSpace(
  pdfDoc: PDFDocument,
  page: any,
  y: number,
  requiredHeight: number,
  margin: number
): { page: any; y: number } {
  const { height } = page.getSize();
  if (y - requiredHeight < margin) {
    const nextPage = pdfDoc.addPage();
    return { page: nextPage, y: height - margin };
  }
  return { page, y };
}

function drawLineChart(
  page: any,
  x: number,
  yTop: number,
  width: number,
  height: number,
  data: number[],
  title: string,
  font: any,
  fontSize: number
): number {
  const yBottom = yTop - height;
  const axisColor = rgb(0.55, 0.55, 0.55);
  const gridColor = rgb(0.85, 0.85, 0.85);
  const labelColor = rgb(0.45, 0.45, 0.45);
  const axisPadding = 18;
  const chartX = x + axisPadding;
  const chartWidth = width - axisPadding - 6;

  page.drawRectangle({
    x,
    y: yBottom,
    width,
    height,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 0.6,
  });

  page.drawText(title, { x, y: yTop + 6, size: fontSize, font });

  if (data.length < 2) {
    page.drawText('No chart data available.', {
      x: x + 8,
      y: yBottom + height / 2,
      size: fontSize,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    return yBottom - fontSize * 1.4;
  }

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;

  page.drawLine({
    start: { x: chartX, y: yBottom },
    end: { x: chartX, y: yTop },
    thickness: 0.8,
    color: axisColor,
  });
  page.drawLine({
    start: { x: chartX, y: yBottom },
    end: { x: chartX + chartWidth, y: yBottom },
    thickness: 0.8,
    color: axisColor,
  });

  const ticks = 4;
  for (let i = 0; i <= ticks; i += 1) {
    const t = i / ticks;
    const yTick = yBottom + t * height;
    page.drawLine({
      start: { x: chartX, y: yTick },
      end: { x: chartX + chartWidth, y: yTick },
      thickness: 0.4,
      color: gridColor,
    });
    const label = formatCompactNumber(minVal + t * range);
    page.drawText(label, {
      x: x + 2,
      y: yTick - fontSize * 0.5,
      size: fontSize - 2,
      font,
      color: labelColor,
    });
  }

  const n = data.length;
  for (let i = 1; i < n; i += 1) {
    const prev = data[i - 1];
    const curr = data[i];
    const x1 = chartX + ((i - 1) / (n - 1)) * chartWidth;
    const x2 = chartX + (i / (n - 1)) * chartWidth;
    const y1 = yBottom + ((prev - minVal) / range) * height;
    const y2 = yBottom + ((curr - minVal) / range) * height;
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: 1.2,
      color: rgb(0.13, 0.8, 0.4),
    });
  }

  const startLabel = 'Start';
  const endLabel = 'End';
  page.drawText(startLabel, {
    x: chartX,
    y: yBottom - fontSize * 1.4,
    size: fontSize - 2,
    font,
    color: labelColor,
  });
  page.drawText(endLabel, {
    x: chartX + chartWidth - font.widthOfTextAtSize(endLabel, fontSize - 2),
    y: yBottom - fontSize * 1.4,
    size: fontSize - 2,
    font,
    color: labelColor,
  });

  return yBottom - fontSize * 3.2;
}

function drawBarChart(
  page: any,
  x: number,
  yTop: number,
  width: number,
  height: number,
  bars: Array<{ label: string; value: number }>,
  title: string,
  font: any,
  fontSize: number
): number {
  const yBottom = yTop - height;
  const axisColor = rgb(0.55, 0.55, 0.55);
  const gridColor = rgb(0.85, 0.85, 0.85);
  const labelColor = rgb(0.45, 0.45, 0.45);
  const axisPadding = 18;
  const chartX = x + axisPadding;
  const chartWidth = width - axisPadding - 6;

  page.drawRectangle({
    x,
    y: yBottom,
    width,
    height,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 0.6,
  });

  page.drawText(title, { x, y: yTop + 6, size: fontSize, font });

  if (bars.length === 0) {
    page.drawText('No chart data available.', {
      x: x + 8,
      y: yBottom + height / 2,
      size: fontSize,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    return yBottom - fontSize * 1.4;
  }

  const values = bars.map((bar) => bar.value);
  const maxVal = Math.max(...values) || 1;
  const gap = Math.min(8, chartWidth * 0.05);
  const barWidth = (chartWidth - gap * (bars.length - 1)) / bars.length;

  page.drawLine({
    start: { x: chartX, y: yBottom },
    end: { x: chartX, y: yTop },
    thickness: 0.8,
    color: axisColor,
  });
  page.drawLine({
    start: { x: chartX, y: yBottom },
    end: { x: chartX + chartWidth, y: yBottom },
    thickness: 0.8,
    color: axisColor,
  });

  const ticks = 4;
  for (let i = 0; i <= ticks; i += 1) {
    const t = i / ticks;
    const yTick = yBottom + t * height;
    page.drawLine({
      start: { x: chartX, y: yTick },
      end: { x: chartX + chartWidth, y: yTick },
      thickness: 0.4,
      color: gridColor,
    });
    const label = formatCompactNumber(t * maxVal);
    page.drawText(label, {
      x: x + 2,
      y: yTick - fontSize * 0.5,
      size: fontSize - 2,
      font,
      color: labelColor,
    });
  }

  bars.forEach((bar, idx) => {
    const barHeight = clampNumber((bar.value / maxVal) * height, 1, height);
    const xPos = chartX + idx * (barWidth + gap);
    page.drawRectangle({
      x: xPos,
      y: yBottom,
      width: barWidth,
      height: barHeight,
      color: rgb(0.95, 0.46, 0.07),
    });

    const label = bar.label.length > 8 ? `${bar.label.slice(0, 8)}…` : bar.label;
    page.drawText(label, {
      x: xPos + 1,
      y: yBottom - fontSize * 1.4,
      size: fontSize - 2,
      font,
      color: labelColor,
    });
  });

  return yBottom - fontSize * 3.2;
}

function buildCoverageLines(coverage?: StockResearchReport['coverage']): string[] {
  if (!coverage) return [];
  const lines: string[] = [];
  lines.push('## Coverage & Omissions');
  lines.push('');
  lines.push('**Included in this report**');
  coverage.included.forEach((item) => lines.push(`- ${item}`));
  if (coverage.missing.length > 0) {
    lines.push('');
    lines.push('**Missing (data unavailable for this symbol)**');
    coverage.missing.forEach((item) => lines.push(`- ${item}`));
  }
  return lines;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { symbol } = await context.params;
    const upperSymbol = symbol.toUpperCase();

    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const reportUrl = new URL(
      `${baseUrl}/api/stocks/${upperSymbol}/research-report`
    );
    url.searchParams.forEach((value, key) => {
      reportUrl.searchParams.set(key, value);
    });

    const res = await fetch(reportUrl.toString(), { cache: 'no-store' });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        {
          error: 'Failed to fetch research report JSON',
          status: res.status,
          details: text.slice(0, 500),
        },
        { status: 500 }
      );
    }

    const data = (await res.json()) as StockResearchReport;

    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();
    const margin = 40;
    const maxWidth = width - margin * 2;

    let y = height - margin;

    // Title
    const title = `Research Note: ${data.symbol} (${data.industry})`;
    const titleSize = 18;
    const titleWidth = boldFont.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
      x: margin + (maxWidth - titleWidth) / 2,
      y,
      size: titleSize,
      font: boldFont,
    });
    y -= titleSize * 2;

    const baseFontSize = 11;
    const lines = splitTextIntoLines(data.report);

    const pricesRes = await fetch(
      `${baseUrl}/api/stocks/${upperSymbol}/prices?days=365`,
      { cache: 'no-store' }
    );
    const pricesData = pricesRes.ok ? await pricesRes.json() : null;
    const closes = Array.isArray(pricesData?.closes)
      ? pricesData.closes.filter((value: unknown) => Number.isFinite(value)) as number[]
      : [];

    const revenueRes = await fetch(
      `${baseUrl}/api/stocks/${upperSymbol}/revenue-estimates`,
      { cache: 'no-store' }
    );
    const revenueData = revenueRes.ok ? await revenueRes.json() : null;
    const revenueEstimates = Array.isArray(revenueData?.data)
      ? revenueData.data
          .map((item: any) => ({
            label: String(item.period ?? ''),
            value: Number(item.revenueAvg ?? 0),
          }))
          .filter((item: { label: string; value: number }) => item.label && Number.isFinite(item.value))
      : [];

    const hasCharts = closes.length > 1 || revenueEstimates.length > 0;
    if (hasCharts) {
      ({ page, y } = ensureSpace(pdfDoc, page, y, 220, margin));
      page.drawText('Charts', { x: margin, y, size: 14, font: boldFont });
      y -= 20;

      if (closes.length > 1) {
        const maxPoints = 120;
        const step = Math.max(1, Math.floor(closes.length / maxPoints));
        const sampled = closes.filter((_, idx) => idx % step === 0);
        ({ page, y } = ensureSpace(pdfDoc, page, y, 160, margin));
        y = drawLineChart(
          page,
          margin,
          y,
          maxWidth,
          120,
          sampled,
          `Price history (last ${closes.length} closes)`,
          font,
          9
        );
      }

      if (revenueEstimates.length > 0) {
        const trimmed = revenueEstimates.slice(0, 6);
        ({ page, y } = ensureSpace(pdfDoc, page, y, 160, margin));
        y = drawBarChart(
          page,
          margin,
          y,
          maxWidth,
          120,
          trimmed,
          'Revenue estimates (avg)',
          font,
          9
        );
      }

      y -= baseFontSize * 1.2;
    }

    const coverageLines = buildCoverageLines(data.coverage);
    if (coverageLines.length > 0) {
      lines.push('');
      lines.push(...coverageLines);
    }

    for (let rawLine of lines) {
      let line = rawLine;
      const trimmed = line.trim();

      if (y < margin + baseFontSize * 2) {
        // Add new page if we're running out of space
        page = pdfDoc.addPage();
        y = height - margin;
      }

      if (trimmed.length === 0) {
        y -= baseFontSize * 1.6;
        continue;
      }

      // Headings: lines starting with # / ## / ###
      let fontSize = baseFontSize;
      let xStart = margin;

      if (trimmed.startsWith('### ')) {
        line = trimmed.substring(4);
        fontSize = 13;
      } else if (trimmed.startsWith('## ')) {
        line = trimmed.substring(3);
        fontSize = 15;
      } else if (trimmed.startsWith('# ')) {
        line = trimmed.substring(2);
        fontSize = 17;
      } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        // Bullet list: prefix with a dot
        line = `• ${trimmed.substring(2)}`;
        fontSize = baseFontSize;
        xStart = margin + 8;
      }

      y = drawMarkdownLine(page, line, xStart, y, font, boldFont, fontSize, margin + maxWidth);
    }

    const pdfBytes = await pdfDoc.save();

    const fileName = `${upperSymbol}-research-note.pdf`;

    const body = Buffer.from(pdfBytes);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(body.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[API] Error generating research report PDF:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate research report PDF',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}


