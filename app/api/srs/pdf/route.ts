import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const srsPdfSchema = z.object({
  title: z.string().min(1).max(160),
  content: z.string().min(1).max(60000),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = srsPdfSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid SRS PDF request." }, { status: 400 });
  }

  const pdf = createTextPdf(parsed.data.title, parsed.data.content);

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="software-requirements-specification.pdf"',
      "Cache-Control": "no-store",
    },
  });
}

function createTextPdf(title: string, content: string) {
  const lines = wrapLines([title, "", ...content.split(/\r?\n/)], 88);
  const pages = chunk(lines, 42);
  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);

  pages.forEach((pageLines, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObjectNumber} 0 R >>`);
    const stream = renderPageStream(pageLines, index + 1, pages.length);
    objects.push(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
  });

  const header = "%PDF-1.4\n";
  let offset = Buffer.byteLength(header, "utf8");
  const parts = [header];
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(offset);
    const part = `${index + 1} 0 obj\n${object}\nendobj\n`;
    parts.push(part);
    offset += Buffer.byteLength(part, "utf8");
  });

  const xrefOffset = offset;
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((item) => `${String(item).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
  ].join("\n");

  return Buffer.from(parts.join("") + xref, "utf8");
}

function renderPageStream(lines: string[], page: number, totalPages: number) {
  const body = lines
    .map((line, index) => {
      const y = 742 - index * 16;
      const isHeading = index === 0 && page === 1;
      return `BT /${isHeading ? "F2" : "F1"} ${isHeading ? 16 : 10} Tf 54 ${y} Td (${escapePdfText(line)}) Tj ET`;
    })
    .join("\n");

  return [
    body,
    `BT /F1 9 Tf 54 34 Td (Page ${page} of ${totalPages}) Tj ET`,
  ].join("\n");
}

function wrapLines(lines: string[], maxLength: number) {
  return lines.flatMap((line) => {
    const trimmed = line.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "- ");
    if (trimmed.length <= maxLength) return [trimmed];

    const wrapped: string[] = [];
    let current = "";
    trimmed.split(/\s+/).forEach((word) => {
      if ((current + " " + word).trim().length > maxLength) {
        wrapped.push(current.trim());
        current = word;
      } else {
        current = `${current} ${word}`.trim();
      }
    });
    if (current) wrapped.push(current);
    return wrapped;
  });
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result.length ? result : [[]];
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
