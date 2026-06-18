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
  const normalizedTitle = normalizePdfText(title);
  const normalizedContent = normalizeSrsContent(content);
  const lines = wrapLines([normalizedTitle, "", ...normalizedContent.split(/\r?\n/)], 88);
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
    const trimmed = normalizePdfText(line).replace(/^#+\s*/, "").replace(/^[-*]\s*/, "- ");
    if (trimmed.length <= maxLength) return [trimmed];

    const wrapped: string[] = [];
    let current = "";
    trimmed.split(/\s+/).forEach((word) => {
      if ((current + " " + word).trim().length > maxLength) {
        if (current.trim()) wrapped.push(current.trim());
        current = word;
      } else {
        current = `${current} ${word}`.trim();
      }
    });
    if (current) wrapped.push(current);
    return wrapped;
  });
}

function normalizeSrsContent(value: string) {
  const trimmed = value.trim();

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return normalizePdfText(jsonToReadableMarkdown(JSON.parse(trimmed)));
    } catch {
      // Keep the original content if it only looks like JSON but is not valid JSON.
    }
  }

  return normalizePdfText(trimmed)
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\n{3,}/g, "\n\n");
}

function jsonToReadableMarkdown(value: unknown, heading = "Software Requirements Specification"): string {
  if (Array.isArray(value)) {
    return value.map((item, index) => jsonToReadableMarkdown(item, `Item ${index + 1}`)).join("\n\n");
  }

  if (value && typeof value === "object") {
    const lines = [`# ${heading}`];
    Object.entries(value).forEach(([key, item]) => {
      const title = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
      if (Array.isArray(item)) {
        lines.push("", `## ${title}`);
        item.forEach((entry) => {
          if (entry && typeof entry === "object") {
            lines.push(jsonToReadableMarkdown(entry, "Requirement").replace(/^# Requirement\n?/, ""));
          } else {
            lines.push(`- ${String(entry)}`);
          }
        });
      } else if (item && typeof item === "object") {
        lines.push("", `## ${title}`, jsonToReadableMarkdown(item, title).replace(/^# .*\n?/, ""));
      } else if (item !== null && item !== undefined && String(item).trim()) {
        lines.push("", `## ${title}`, String(item));
      }
    });
    return lines.join("\n");
  }

  return String(value ?? "");
}

function normalizePdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u2022\u25CF\u25E6]/g, "-")
    .replace(/[\u2026]/g, "...")
    .replace(/[\u2190-\u21FF]/g, "->")
    .replace(/[\u00A0]/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
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
