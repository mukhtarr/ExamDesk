import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { jsPDF } from 'jspdf';
import type { PaperSection } from '../types';

export interface ExportPaperPayload {
  title: string;
  subjectCode: string;
  subjectName: string;
  examType: string;
  academicTerm: string;
  durationMinutes: number;
  totalMarks: number;
  instructions: string[];
  sections: PaperSection[];
  includeBloomsTags?: boolean;
  includeAnswerKey?: boolean;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeFilename(title: string, ext: string): string {
  const clean = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${clean || 'question-paper'}.${ext}`;
}

export async function exportPaperToDocx(paper: ExportPaperPayload): Promise<void> {
  const children: (Paragraph | Table)[] = [];

  // Institutional Header
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: 'ACADEMIC EXAMINATION BOARD',
          bold: true,
          size: 28,
          font: 'Calibri',
          color: '0F172A',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: `${paper.examType} · ${paper.academicTerm}`,
          bold: true,
          size: 22,
          font: 'Calibri',
          color: '334155',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `${paper.subjectCode}: ${paper.subjectName}`,
          bold: true,
          size: 24,
          font: 'Calibri',
          color: '1E3A5F',
        }),
      ],
    })
  );

  // Metadata Table
  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
            },
            children: [
              new Paragraph({
                spacing: { before: 80, after: 80 },
                children: [
                  new TextRun({ text: 'Paper Title: ', bold: true, size: 20 }),
                  new TextRun({ text: paper.title, size: 20 }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
            },
            children: [
              new Paragraph({
                spacing: { before: 80, after: 80 },
                children: [
                  new TextRun({ text: 'Duration: ', bold: true, size: 20 }),
                  new TextRun({ text: `${paper.durationMinutes} mins`, size: 20 }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
            },
            children: [
              new Paragraph({
                spacing: { before: 80, after: 80 },
                children: [
                  new TextRun({ text: 'Max Marks: ', bold: true, size: 20 }),
                  new TextRun({ text: `${paper.totalMarks}`, size: 20 }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
  children.push(metaTable);

  // Instructions
  if (paper.instructions.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [new TextRun({ text: 'General Instructions:', bold: true, size: 21 })],
      })
    );
    paper.instructions.forEach((inst, idx) => {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: `${idx + 1}. ${inst}`, size: 20, color: '334155' })],
        })
      );
    });
  }

  let globalQNum = 1;

  for (const section of paper.sections) {
    const sectionMaxMarks = section.compulsoryCount * section.marksPerQuestion;
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 260, after: 80 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: '0F172A' },
        },
        children: [
          new TextRun({
            text: `${section.title}  —  ${section.description} (${sectionMaxMarks} Marks)`,
            bold: true,
            size: 22,
            color: '0F172A',
          }),
        ],
      })
    );

    section.questions.forEach((slot) => {
      const tagSuffix = paper.includeBloomsTags
        ? `   [Bloom L${slot.bloomLevel} · ${slot.actionVerb} · ${slot.difficulty}]`
        : '';

      children.push(
        new Paragraph({
          spacing: { before: 120, after: 40 },
          children: [
            new TextRun({
              text: `Q${globalQNum}. `,
              bold: true,
              size: 21,
            }),
            new TextRun({
              text: slot.text,
              size: 21,
            }),
            new TextRun({
              text: `   [${slot.marks} Marks]`,
              bold: true,
              size: 20,
              color: '1E3A5F',
            }),
          ],
        })
      );

      if (tagSuffix) {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: `    Topic: ${slot.topic}${tagSuffix}`,
                italics: true,
                size: 18,
                color: '64748B',
              }),
            ],
          })
        );
      }
      globalQNum += 1;
    });
  }

  if (paper.includeAnswerKey) {
    children.push(
      new Paragraph({
        pageBreakBefore: true,
        spacing: { after: 140 },
        children: [
          new TextRun({
            text: 'MARKING SCHEME & EXPECTED ANSWERS',
            bold: true,
            size: 26,
            color: '0F172A',
          }),
        ],
      })
    );
    let ansNum = 1;
    for (const section of paper.sections) {
      for (const slot of section.questions) {
        children.push(
          new Paragraph({
            spacing: { before: 100, after: 40 },
            children: [
              new TextRun({
                text: `Q${ansNum} (${slot.marks} Marks · Bloom L${slot.bloomLevel} · ${slot.actionVerb}): `,
                bold: true,
                size: 20,
              }),
              new TextRun({
                text: slot.expectedAnswer || 'Evaluate conceptual accuracy, structured reasoning, and domain terminology.',
                size: 20,
                color: '334155',
              }),
            ],
          })
        );
        ansNum += 1;
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, safeFilename(`${paper.subjectCode}-${paper.title}`, 'docx'));
}

export function exportPaperToPdf(paper: ExportPaperPayload): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = 52;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 54) {
      doc.addPage();
      y = 52;
    }
  };

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('ACADEMIC EXAMINATION BOARD', pageWidth / 2, y, { align: 'center' });
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(51, 65, 85);
  doc.text(`${paper.examType}  ·  ${paper.academicTerm}`, pageWidth / 2, y, { align: 'center' });
  y += 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(30, 58, 95);
  doc.text(`${paper.subjectCode}: ${paper.subjectName}`, pageWidth / 2, y, { align: 'center' });
  y += 18;

  // Metadata Box
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.75);
  doc.rect(margin, y, maxWidth, 34);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Paper: ${paper.title}`, margin + 10, y + 21);
  doc.text(
    `Duration: ${paper.durationMinutes} mins   |   Max Marks: ${paper.totalMarks}`,
    pageWidth - margin - 10,
    y + 21,
    { align: 'right' }
  );
  y += 50;

  // Instructions
  if (paper.instructions.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('General Instructions:', margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    paper.instructions.forEach((inst, idx) => {
      const lines = doc.splitTextToSize(`${idx + 1}. ${inst}`, maxWidth);
      ensureSpace(lines.length * 13 + 4);
      doc.text(lines, margin, y);
      y += lines.length * 13 + 3;
    });
    y += 8;
  }

  let globalQNum = 1;

  for (const section of paper.sections) {
    const sectionMaxMarks = section.compulsoryCount * section.marksPerQuestion;
    ensureSpace(40);
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(1);
    doc.line(margin, y, pageWidth - margin, y);
    y += 16;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${section.title} — ${section.description}`, margin, y);
    doc.text(`[${sectionMaxMarks} Marks]`, pageWidth - margin, y, { align: 'right' });
    y += 18;

    for (const slot of section.questions) {
      const qPrefix = `Q${globalQNum}. `;
      const marksLabel = `[${slot.marks} M]`;
      const bodyLines = doc.splitTextToSize(`${qPrefix}${slot.text}`, maxWidth - 52);
      ensureSpace(bodyLines.length * 14 + 22);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(15, 23, 42);
      doc.text(bodyLines, margin, y);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 58, 95);
      doc.text(marksLabel, pageWidth - margin, y, { align: 'right' });

      y += bodyLines.length * 14 + 2;

      if (paper.includeBloomsTags) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `Topic: ${slot.topic} · Bloom L${slot.bloomLevel} · Verb: ${slot.actionVerb} · ${slot.difficulty}`,
          margin + 18,
          y
        );
        y += 13;
      } else {
        y += 6;
      }

      globalQNum += 1;
    }
    y += 10;
  }

  if (paper.includeAnswerKey) {
    doc.addPage();
    y = 52;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('MARKING SCHEME & EXPECTED ANSWERS', margin, y);
    y += 22;

    let ansNum = 1;
    for (const section of paper.sections) {
      for (const slot of section.questions) {
        const header = `Q${ansNum} (${slot.marks} Marks · Bloom L${slot.bloomLevel} · ${slot.actionVerb})`;
        const ansText =
          slot.expectedAnswer ||
          'Evaluate conceptual accuracy, structured reasoning, and domain terminology.';
        const ansLines = doc.splitTextToSize(ansText, maxWidth);
        ensureSpace(ansLines.length * 13 + 24);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(header, margin, y);
        y += 14;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);
        doc.text(ansLines, margin, y);
        y += ansLines.length * 13 + 10;
        ansNum += 1;
      }
    }
  }

  doc.save(safeFilename(`${paper.subjectCode}-${paper.title}`, 'pdf'));
}
