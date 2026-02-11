import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface RouteContext {
  params: Promise<{ industry: string }>;
}

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

export async function POST(request: Request, context: RouteContext) {
  try {
    const { industry } = await context.params;
    const decodedIndustry = decodeURIComponent(industry || '');

    if (!decodedIndustry.trim()) {
      return NextResponse.json(
        { error: 'Industry path parameter must be non-empty' },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      symbols?: unknown;
      limit?: unknown;
      title?: unknown;
      rankings?: Record<string, { rank?: unknown; total?: unknown }>;
    } | null;

    if (!body || !Array.isArray(body.symbols)) {
      return NextResponse.json(
        { error: 'Request body must include "symbols" array' },
        { status: 400 }
      );
    }

    const seen = new Set<string>();
    const symbols = body.symbols
      .map((s) => String(s).trim().toUpperCase())
      .filter((s) => s.length > 0)
      .filter((s) => {
        if (seen.has(s)) return false;
        seen.add(s);
        return true;
      });

    const limitRaw = typeof body.limit === 'number' ? body.limit : Number(body.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : symbols.length;
    const selected = symbols.slice(0, limit);
    const rankings = body?.rankings ?? {};

    if (selected.length === 0) {
      return NextResponse.json(
        { error: 'No valid symbols provided' },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const cover = pdfDoc.addPage();
    const { width, height } = cover.getSize();
    const margin = 40;
    const maxWidth = width - margin * 2;
    let y = height - margin;

    const title = typeof body.title === 'string' && body.title.trim()
      ? body.title.trim()
      : `Industry Report: ${decodedIndustry}`;
    const titleSize = 18;
    cover.drawText(title, {
      x: margin,
      y,
      size: titleSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    y -= titleSize * 1.8;

    const dateStr = new Date().toISOString().slice(0, 10);
    cover.drawText(`Generated: ${dateStr}`, {
      x: margin,
      y,
      size: 11,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 20;

    cover.drawText(`Symbols (${selected.length}):`, {
      x: margin,
      y,
      size: 11,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 16;

    const symbolLine = selected.join(', ');
    const lines = wrapText(symbolLine, 90);
    for (const line of lines) {
      cover.drawText(line, {
        x: margin,
        y,
        size: 10,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= 14;
    }

    const errors: string[] = [];
    for (const symbol of selected) {
      const reportUrl = new URL(
        `${baseUrl}/api/stocks/${encodeURIComponent(symbol)}/research-report/pdf`
      );
      const rankInfo = rankings[symbol];
      const rankNum = Number(rankInfo?.rank);
      const totalNum = Number(rankInfo?.total);
      if (Number.isFinite(rankNum) && Number.isFinite(totalNum) && rankNum > 0 && totalNum > 0) {
        reportUrl.searchParams.set('rank', String(Math.floor(rankNum)));
        reportUrl.searchParams.set('total', String(Math.floor(totalNum)));
      }

      const res = await fetch(reportUrl.toString(), { cache: 'no-store' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        errors.push(`${symbol}: ${res.status} ${text.slice(0, 120)}`);
        continue;
      }
      const bytes = await res.arrayBuffer();
      const sourceDoc = await PDFDocument.load(bytes);
      const pages = await pdfDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
      pages.forEach((page) => pdfDoc.addPage(page));
    }

    if (errors.length > 0) {
      let errPage = pdfDoc.addPage();
      let errY = errPage.getSize().height - margin;
      const drawHeader = () => {
        errPage.drawText('Report generation errors', {
          x: margin,
          y: errY,
          size: 14,
          font: boldFont,
        });
        errY -= 18;
      };

      drawHeader();
      for (const line of errors) {
        if (errY < margin + 20) {
          errPage = pdfDoc.addPage();
          errY = errPage.getSize().height - margin;
          drawHeader();
        }
        errPage.drawText(`- ${line}`, {
          x: margin,
          y: errY,
          size: 10,
          font,
        });
        errY -= 14;
      }
    }

    const pdfBytes = await pdfDoc.save();
    const filename = `industry_report_${decodedIndustry.replace(/\\s+/g, '_')}_${dateStr}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=\"${filename}\"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to generate industry report PDF',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
