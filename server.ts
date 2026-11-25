import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import mammoth from 'mammoth';
import nodemailer from 'nodemailer';
import { GoogleGenAI, Type } from '@google/genai';

const PORT = 3000;
const app = express();

app.use(express.json({ limit: '5mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

interface MarkBucketInput {
  count: number;
  marks: number;
  difficulty?: string;
  topic?: string;
}

interface GeneratedQuestionOutput {
  text: string;
  topic: string;
  marks: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  bloomLevel: 2 | 3 | 4;
  actionVerb: string;
  expectedAnswer: string;
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 150;
}

app.get('/api/health', (_req: Request, res: Response) => {
  const smtpConfigured = Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );
  res.json({ ok: true, smtpConfigured });
});

app.post(
  '/api/syllabus/generate',
  upload.single('syllabusFile'),
  async (req: Request, res: Response) => {
    try {
      const subjectCode = String(req.body.subjectCode || '').trim().slice(0, 20);
      const subjectName = String(req.body.subjectName || '').trim().slice(0, 120);
      const rawSyllabusText = String(req.body.syllabusText || '').trim();
      const rawRequests = String(req.body.requests || '[]');

      let markRequests: MarkBucketInput[] = [];
      try {
        const parsed = JSON.parse(rawRequests);
        if (Array.isArray(parsed)) {
          markRequests = parsed
            .map((item) => ({
              count: Math.min(Math.max(Number(item.count) || 1, 1), 15),
              marks: Math.min(Math.max(Number(item.marks) || 2, 1), 50),
              difficulty: typeof item.difficulty === 'string' ? item.difficulty.slice(0, 20) : 'Mixed',
              topic: typeof item.topic === 'string' ? item.topic.slice(0, 120) : '',
            }))
            .slice(0, 10);
        }
      } catch {
        res.status(400).json({ error: 'Invalid mark distribution format.' });
        return;
      }

      if (markRequests.length === 0) {
        res.status(400).json({ error: 'Please specify at least one mark allocation request.' });
        return;
      }

      const totalQuestionsRequested = markRequests.reduce((sum, r) => sum + r.count, 0);
      if (totalQuestionsRequested > 30) {
        res.status(400).json({ error: 'Please request at most 30 questions per generation batch.' });
        return;
      }

      let extractedText = rawSyllabusText;
      let pdfInlinePart: { inlineData: { mimeType: string; data: string } } | null = null;

      if (req.file) {
        const originalName = req.file.originalname.toLowerCase();
        const mime = req.file.mimetype;

        if (mime === 'application/pdf' || originalName.endsWith('.pdf')) {
          pdfInlinePart = {
            inlineData: {
              mimeType: 'application/pdf',
              data: req.file.buffer.toString('base64'),
            },
          };
        } else if (
          mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          originalName.endsWith('.docx')
        ) {
          const result = await mammoth.extractRawText({ buffer: req.file.buffer });
          extractedText = [extractedText, result.value].filter(Boolean).join('\n\n').trim();
        } else if (
          mime.startsWith('text/') ||
          originalName.endsWith('.txt') ||
          originalName.endsWith('.md') ||
          originalName.endsWith('.csv')
        ) {
          const textContent = req.file.buffer.toString('utf-8');
          extractedText = [extractedText, textContent].filter(Boolean).join('\n\n').trim();
        } else {
          res.status(400).json({
            error: 'Unsupported syllabus file format. Please upload PDF, DOCX, TXT, or Markdown.',
          });
          return;
        }
      }

      if (!pdfInlinePart && extractedText.length < 20) {
        res.status(400).json({
          error: 'Please upload a syllabus file or paste at least 20 characters of syllabus content.',
        });
        return;
      }

      const ai = getAiClient();

      const requestSummary = markRequests
        .map(
          (r, idx) =>
            `Batch ${idx + 1}: Generate exactly ${r.count} question(s) worth ${r.marks} marks each` +
            (r.difficulty && r.difficulty !== 'Mixed' ? `, difficulty: ${r.difficulty}` : ', varied difficulty') +
            (r.topic ? `, focused on topic: "${r.topic}"` : '')
        )
        .join('\n');

      const promptText = `You are a senior university examination setter and pedagogical assessment specialist.
Course: ${subjectCode ? `${subjectCode} — ` : ''}${subjectName || 'Academic Course'}

TASK:
Analyze the provided syllabus content and generate examination questions matching these exact mark allocations:
${requestSummary}

STRICT PEDAGOGICAL CONSTRAINTS:
1. BLOOM'S TAXONOMY LEVELS: Every single generated question MUST strictly belong to Bloom's Taxonomy Level 2 (Understand), Level 3 (Apply), or Level 4 (Analyze).
   - Never generate Level 1 (Remember/Recall like "Define", "List", "State") or Level 5/6 questions.
   - Distribute questions across Levels 2, 3, and 4 thoughtfully:
     * Lower-mark questions (e.g., 2-4 marks) should favor Level 2 (Understand) and Level 3 (Apply).
     * Mid/High-mark questions (e.g., 5-15 marks) should favor Level 3 (Apply) and Level 4 (Analyze).
2. ACTION VERB VARIETY: Start or anchor each question with a distinct, explicit Bloom's action verb appropriate to its level, avoiding repeating the same verb consecutively:
   - Level 2 (Understand) verbs: Explain, Summarize, Classify, Illustrate, Compare, Interpret, Paraphrase, Distinguish, Infer
   - Level 3 (Apply) verbs: Apply, Solve, Implement, Demonstrate, Calculate, Construct, Execute, Sketch, Use
   - Level 4 (Analyze) verbs: Analyze, Differentiate, Examine, Deconstruct, Contrast, Investigate, Categorize, Deduce, Breakdown
3. EXACT COUNTS & MARKS: The total number of questions returned MUST equal ${totalQuestionsRequested}, matching the exact counts and mark values specified in each batch above.
4. SYLLABUS GROUNDING: Every question must directly assess concepts present in the provided syllabus. Include a concise expectedAnswer / marking rubric for each question, plus a clean extractedSyllabusText summary and list of detectedTopics.

${extractedText ? `SYLLABUS TEXT:\n${extractedText.slice(0, 35000)}` : 'Please extract the syllabus from the attached PDF document.'}`;

      const contents = pdfInlinePart
        ? { parts: [pdfInlinePart, { text: promptText }] }
        : promptText;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction:
            'You are an academic examination board AI. Always output valid JSON adhering strictly to the schema. Only use Bloom levels 2, 3, or 4.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              extractedSyllabusText: {
                type: Type.STRING,
                description: 'Concise structured summary of the syllabus modules/units.',
              },
              detectedTopics: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'List of 4 to 15 main syllabus topics detected.',
              },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING, description: 'Full examination question prompt.' },
                    topic: { type: Type.STRING, description: 'Specific syllabus topic assessed.' },
                    marks: { type: Type.INTEGER, description: 'Exact marks requested for this question.' },
                    difficulty: { type: Type.STRING, description: 'One of: Easy, Medium, Hard' },
                    bloomLevel: { type: Type.INTEGER, description: 'Must be 2, 3, or 4.' },
                    actionVerb: { type: Type.STRING, description: 'Primary Bloom action verb used in the question.' },
                    expectedAnswer: { type: Type.STRING, description: 'Concise marking rubric and key points.' },
                  },
                  required: ['text', 'topic', 'marks', 'difficulty', 'bloomLevel', 'actionVerb', 'expectedAnswer'],
                },
              },
            },
            required: ['extractedSyllabusText', 'detectedTopics', 'questions'],
          },
        },
      });

      const rawJson = (response.text ?? '{}').trim();
      const parsedOutput = JSON.parse(rawJson) as {
        extractedSyllabusText?: string;
        detectedTopics?: string[];
        questions?: GeneratedQuestionOutput[];
      };

      const normalizedQuestions = (parsedOutput.questions || []).map((q) => {
        const bloom = [2, 3, 4].includes(Number(q.bloomLevel)) ? (Number(q.bloomLevel) as 2 | 3 | 4) : 3;
        const diff = ['Easy', 'Medium', 'Hard'].includes(q.difficulty)
          ? (q.difficulty as 'Easy' | 'Medium' | 'Hard')
          : q.marks <= 3
          ? 'Easy'
          : q.marks <= 6
          ? 'Medium'
          : 'Hard';
        return {
          text: String(q.text || '').trim().slice(0, 2000),
          topic: String(q.topic || 'General').trim().slice(0, 120),
          marks: Math.min(Math.max(Math.round(Number(q.marks) || 2), 1), 50),
          difficulty: diff,
          bloomLevel: bloom,
          actionVerb: String(q.actionVerb || 'Explain').trim().slice(0, 40),
          expectedAnswer: String(q.expectedAnswer || '').trim().slice(0, 3000),
        };
      });

      res.json({
        extractedSyllabusText: (parsedOutput.extractedSyllabusText || extractedText).slice(0, 40000),
        detectedTopics: (parsedOutput.detectedTopics || []).slice(0, 20),
        questions: normalizedQuestions,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate questions from syllabus.';
      console.error('Syllabus generation error:', err);
      res.status(500).json({ error: message });
    }
  }
);

app.post('/api/notifications/send-review-email', async (req: Request, res: Response) => {
  try {
    const toEmail = sanitizeHeaderValue(String(req.body.toEmail || ''));
    const toName = sanitizeHeaderValue(String(req.body.toName || 'Reviewer')).slice(0, 100);
    const subjectCode = sanitizeHeaderValue(String(req.body.subjectCode || '')).slice(0, 20);
    const paperTitle = sanitizeHeaderValue(String(req.body.paperTitle || '')).slice(0, 150);
    const triggerType = String(req.body.triggerType || 'reminder_overdue');
    const reviewNotes = String(req.body.reviewNotes || '').trim().slice(0, 1500);
    const senderName = sanitizeHeaderValue(String(req.body.senderName || 'ExamDesk Coordinator')).slice(0, 100);

    if (!isValidEmail(toEmail)) {
      res.status(400).json({ error: 'Valid recipient email is required.' });
      return;
    }
    if (!paperTitle) {
      res.status(400).json({ error: 'Paper title is required.' });
      return;
    }

    let emailSubject = '';
    let emailBody = '';

    if (triggerType === 'submission') {
      emailSubject = `[ExamDesk Review Requested] ${subjectCode}: ${paperTitle}`;
      emailBody = `Dear ${toName},\n\nA new question paper has been submitted for your review by ${senderName}.\n\nCourse: ${subjectCode}\nPaper Title: ${paperTitle}\n\nPlease sign in to ExamDesk to verify Bloom's Taxonomy alignment (Levels 2-4), marks distribution, and question selection.\n\nRegards,\nExamDesk Examination Cell`;
    } else if (triggerType === 'changes_requested') {
      emailSubject = `[Action Required] Revisions Requested for ${subjectCode}: ${paperTitle}`;
      emailBody = `Dear ${toName},\n\nThe Exam Controller (${senderName}) has reviewed "${paperTitle}" (${subjectCode}) and requested revisions before approval.\n\nReviewer Notes:\n${reviewNotes || 'Please review section balance and Bloom level distribution.'}\n\nPlease update the draft in ExamDesk and resubmit for review.\n\nRegards,\nExamDesk Examination Cell`;
    } else if (triggerType === 'approved') {
      emailSubject = `[Approved] ${subjectCode}: ${paperTitle} is Ready for Publication`;
      emailBody = `Dear ${toName},\n\nYour question paper "${paperTitle}" (${subjectCode}) has been approved by ${senderName}.\n\n${reviewNotes ? `Notes: ${reviewNotes}\n\n` : ''}You may now export the finalized Word (.docx) and PDF copies from ExamDesk.\n\nRegards,\nExamDesk Examination Cell`;
    } else {
      emailSubject = `[Reminder: Pending Review] ${subjectCode}: ${paperTitle}`;
      emailBody = `Dear ${toName},\n\nThis is an automated reminder that the question paper "${paperTitle}" (${subjectCode}) is currently awaiting your review in ExamDesk.\n\n${reviewNotes ? `Context: ${reviewNotes}\n\n` : ''}Kindly complete the review cycle at your earliest convenience to keep examination scheduling on track.\n\nRegards,\n${senderName}\nExamDesk Examination Cell`;
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpFrom = process.env.SMTP_FROM || smtpUser || 'no-reply@examdesk.edu';

    if (smtpHost && smtpUser && smtpPass) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: smtpFrom,
        to: toEmail,
        subject: emailSubject,
        text: emailBody,
      });

      res.json({
        deliveryStatus: 'sent_smtp',
        emailSubject,
        emailBody,
        deliveryNote: `Email dispatched via SMTP (${smtpHost}) to ${toEmail}.`,
      });
      return;
    }

    res.json({
      deliveryStatus: 'queued_preview',
      emailSubject,
      emailBody,
      deliveryNote: `SMTP not configured in environment secrets; notification logged for ${toEmail}. Configure SMTP_HOST/SMTP_USER/SMTP_PASS for live mail relay.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to process review email notification.';
    console.error('Notification dispatch error:', err);
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ExamDesk server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
