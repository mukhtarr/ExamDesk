import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  increment,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  FileText,
  Plus,
  RefreshCw,
  Replace,
  Send,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { assemblePaperSections, auditPaperBlooms, getBloomLabel } from '../lib/blooms';
import { exportPaperToDocx, exportPaperToPdf } from '../lib/exporters';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import type {
  BloomLevel,
  Difficulty,
  PaperQuestionSlot,
  PaperSection,
  PaperTemplate,
  Question,
  QuestionPaper,
  Subject,
  TemplateSectionConfig,
  UserProfile,
} from '../types';

interface PaperBuilderProps {
  subjects: Subject[];
  questions: Question[];
  templates: PaperTemplate[];
  papers: QuestionPaper[];
  currentUser: UserProfile;
  effectiveRole: 'exam_controller' | 'subject_owner';
  editingPaperId: string | null;
  onClearEditingPaper: () => void;
  onNavigateToReview: () => void;
}

export function PaperBuilder({
  subjects,
  questions,
  templates,
  papers,
  currentUser,
  effectiveRole,
  editingPaperId,
  onClearEditingPaper,
  onNavigateToReview,
}: PaperBuilderProps) {
  const [activePaperId, setActivePaperId] = useState<string | null>(editingPaperId);
  const [subjectId, setSubjectId] = useState<string>(subjects[0]?.id || '');
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id || '');

  const [title, setTitle] = useState('End-Semester Examination Set A');
  const [examType, setExamType] = useState('End-Semester Examination');
  const [academicTerm, setAcademicTerm] = useState('Autumn 2026');
  const [durationMinutes, setDurationMinutes] = useState(150);
  const [instructionsText, setInstructionsText] = useState(
    'All sections are compulsory unless internal choice is indicated.\nIllustrate answers with neat diagrams or derivations wherever applicable.'
  );

  const [sectionConfigs, setSectionConfigs] = useState<TemplateSectionConfig[]>(
    templates[0]?.sections || [
      {
        id: 'sec-a',
        title: 'Section A',
        description: 'Short Conceptual Questions',
        questionCount: 5,
        marksPerQuestion: 2,
        compulsoryCount: 5,
        preferredDifficulty: 'Easy',
        allowedBloomLevels: [2, 3],
      },
      {
        id: 'sec-b',
        title: 'Section B',
        description: 'Applied Problem Solving',
        questionCount: 4,
        marksPerQuestion: 5,
        compulsoryCount: 4,
        preferredDifficulty: 'Medium',
        allowedBloomLevels: [3, 4],
      },
    ]
  );

  const [topicFilter, setTopicFilter] = useState('ALL');
  const [difficultyOverride, setDifficultyOverride] = useState<Difficulty | 'TemplateDefault'>(
    'TemplateDefault'
  );
  const [bloomFocus, setBloomFocus] = useState<BloomLevel | 'Balanced'>('Balanced');

  const [sections, setSections] = useState<PaperSection[]>([]);
  const [assemblyWarnings, setAssemblyWarnings] = useState<string[]>([]);
  const [includeBloomsTags, setIncludeBloomsTags] = useState(false);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Manual Override Picker Modal state
  const [overrideTarget, setOverrideTarget] = useState<{
    sectionId: string;
    slotId: string;
    expectedMarks: number;
  } | null>(null);
  const [pickerTopic, setPickerTopic] = useState('ALL');
  const [pickerDifficulty, setPickerDifficulty] = useState('ALL');
  const [pickerMarks, setPickerMarks] = useState('ALL');
  const [pickerBloom, setPickerBloom] = useState('ALL');
  const [pickerSearch, setPickerSearch] = useState('');
  const [customOverrideMode, setCustomOverrideMode] = useState(false);
  const [customText, setCustomText] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [customBloom, setCustomBloom] = useState<BloomLevel>(3);
  const [customVerb, setCustomVerb] = useState('Analyze');
  const [customDifficulty, setCustomDifficulty] = useState<Difficulty>('Medium');
  const [customMarks, setCustomMarks] = useState(5);

  // Load existing paper if selected from Review tab
  useEffect(() => {
    if (!subjectId && subjects.length > 0) {
      setSubjectId(subjects[0].id);
    }
  }, [subjects, subjectId]);

  useEffect(() => {
    if (!templateId && templates.length > 0 && !editingPaperId) {
      const tpl = templates[0];
      setTemplateId(tpl.id);
      setDurationMinutes(tpl.durationMinutes);
      setInstructionsText(tpl.instructions.join('\n'));
      setSectionConfigs(tpl.sections.map((s) => ({ ...s })));
    }
  }, [templates, templateId, editingPaperId]);

  useEffect(() => {
    if (!editingPaperId) return;
    const found = papers.find((p) => p.id === editingPaperId);
    if (found) {
      setActivePaperId(found.id);
      setSubjectId(found.subjectId);
      setTitle(found.title);
      setExamType(found.examType);
      setAcademicTerm(found.academicTerm);
      setDurationMinutes(found.durationMinutes);
      setInstructionsText((found.instructions || []).join('\n'));
      setSections(found.sections || []);
      setSectionConfigs(
        (found.sections || []).map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          questionCount: s.questions.length,
          marksPerQuestion: s.marksPerQuestion,
          compulsoryCount: s.compulsoryCount,
          preferredDifficulty: 'Mixed',
          allowedBloomLevels: [2, 3, 4],
        }))
      );
      setStatusMessage(`Loaded "${found.title}" (${found.status.replace('_', ' ')}).`);
    }
  }, [editingPaperId, papers]);

  const activeSubject = subjects.find((s) => s.id === subjectId) || subjects[0];
  const subjectQuestions = useMemo(
    () => questions.filter((q) => q.subjectId === (activeSubject?.id || '')),
    [questions, activeSubject]
  );

  const subjectTopics = useMemo(() => {
    const set = new Set<string>(activeSubject?.topics || []);
    subjectQuestions.forEach((q) => set.add(q.topic));
    return Array.from(set).sort();
  }, [activeSubject, subjectQuestions]);

  const audit = useMemo(() => auditPaperBlooms(sections), [sections]);
  const plannedTotalMarks = useMemo(
    () => sectionConfigs.reduce((sum, s) => sum + s.compulsoryCount * s.marksPerQuestion, 0),
    [sectionConfigs]
  );

  const handleApplyTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setDurationMinutes(tpl.durationMinutes);
    setInstructionsText(tpl.instructions.join('\n'));
    setSectionConfigs(tpl.sections.map((s) => ({ ...s })));
    setSections([]);
    setAssemblyWarnings([]);
  };

  const handleAutoAssemble = () => {
    setErrorMsg(null);
    setStatusMessage(null);
    if (!activeSubject) {
      setErrorMsg('Please select a course first.');
      return;
    }
    const { sections: built, warnings } = assemblePaperSections(
      sectionConfigs,
      subjectQuestions,
      {
        topicFilter,
        difficultyOverride,
        bloomFocus,
      }
    );
    setSections(built);
    setAssemblyWarnings(warnings);
    setStatusMessage(
      `Assembled ${built.reduce((sum, s) => sum + s.questions.length, 0)} questions across ${built.length} sections.`
    );
  };

  const addSectionConfig = () => {
    const nextIdx = sectionConfigs.length + 1;
    const letter = String.fromCharCode(64 + nextIdx);
    setSectionConfigs((prev) => [
      ...prev,
      {
        id: `sec-${Date.now()}`,
        title: `Section ${letter}`,
        description: 'Analytical Questions',
        questionCount: 2,
        marksPerQuestion: 5,
        compulsoryCount: 2,
        preferredDifficulty: 'Medium',
        allowedBloomLevels: [3, 4],
      },
    ]);
  };

  const updateSectionConfig = (id: string, patch: Partial<TemplateSectionConfig>) => {
    setSectionConfigs((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeSectionConfig = (id: string) => {
    if (sectionConfigs.length <= 1) return;
    setSectionConfigs((prev) => prev.filter((s) => s.id !== id));
  };

  const openOverridePicker = (sectionId: string, slot: PaperQuestionSlot) => {
    setOverrideTarget({
      sectionId,
      slotId: slot.slotId,
      expectedMarks: slot.marks,
    });
    setPickerTopic('ALL');
    setPickerDifficulty('ALL');
    setPickerMarks(String(slot.marks));
    setPickerBloom('ALL');
    setPickerSearch('');
    setCustomOverrideMode(false);
    setCustomText(slot.text);
    setCustomTopic(slot.topic);
    setCustomBloom(slot.bloomLevel);
    setCustomVerb(slot.actionVerb);
    setCustomDifficulty(slot.difficulty);
    setCustomMarks(slot.marks);
  };

  const filteredPickerQuestions = useMemo(() => {
    const qLower = pickerSearch.trim().toLowerCase();
    return subjectQuestions.filter((q) => {
      if (pickerTopic !== 'ALL' && q.topic !== pickerTopic) return false;
      if (pickerDifficulty !== 'ALL' && q.difficulty !== pickerDifficulty) return false;
      if (pickerMarks !== 'ALL' && String(q.marks) !== pickerMarks) return false;
      if (pickerBloom !== 'ALL' && String(q.bloomLevel) !== pickerBloom) return false;
      if (
        qLower &&
        !q.text.toLowerCase().includes(qLower) &&
        !q.topic.toLowerCase().includes(qLower) &&
        !q.actionVerb.toLowerCase().includes(qLower)
      ) {
        return false;
      }
      return true;
    });
  }, [subjectQuestions, pickerTopic, pickerDifficulty, pickerMarks, pickerBloom, pickerSearch]);

  const applyBankOverride = (replacement: Question) => {
    if (!overrideTarget) return;
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== overrideTarget.sectionId) return sec;
        return {
          ...sec,
          questions: sec.questions.map((slot) =>
            slot.slotId === overrideTarget.slotId
              ? {
                  ...slot,
                  originalQuestionId: slot.questionId,
                  questionId: replacement.id,
                  text: replacement.text,
                  topic: replacement.topic,
                  difficulty: replacement.difficulty,
                  marks: sec.marksPerQuestion,
                  bloomLevel: replacement.bloomLevel,
                  actionVerb: replacement.actionVerb,
                  expectedAnswer: replacement.expectedAnswer,
                  isManualOverride: true,
                }
              : slot
          ),
        };
      })
    );
    setOverrideTarget(null);
    setStatusMessage('Manual question override applied.');
  };

  const applyCustomTextOverride = () => {
    if (!overrideTarget || customText.trim().length < 10) return;
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== overrideTarget.sectionId) return sec;
        return {
          ...sec,
          questions: sec.questions.map((slot) =>
            slot.slotId === overrideTarget.slotId
              ? {
                  ...slot,
                  originalQuestionId: slot.questionId,
                  text: customText.trim(),
                  topic: customTopic.trim() || slot.topic,
                  difficulty: customDifficulty,
                  marks: customMarks,
                  bloomLevel: customBloom,
                  actionVerb: customVerb.trim() || 'Analyze',
                  isManualOverride: true,
                }
              : slot
          ),
        };
      })
    );
    setOverrideTarget(null);
    setStatusMessage('Custom manual question edit applied.');
  };

  const moveSlot = (sectionId: string, index: number, direction: -1 | 1) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= sec.questions.length) return sec;
        const copy = [...sec.questions];
        const temp = copy[index];
        copy[index] = copy[targetIndex];
        copy[targetIndex] = temp;
        return { ...sec, questions: copy };
      })
    );
  };

  const persistPaper = async (targetStatus: 'draft' | 'pending_review') => {
    setErrorMsg(null);
    setStatusMessage(null);

    if (!activeSubject) {
      setErrorMsg('Please select a subject.');
      return;
    }
    if (title.trim().length < 3) {
      setErrorMsg('Please enter a paper title (at least 3 characters).');
      return;
    }
    if (sections.length === 0 || audit.totalQuestions === 0) {
      setErrorMsg('Please assemble questions into your sections before saving.');
      return;
    }

    const isSubmit = targetStatus === 'pending_review';
    if (isSubmit) setSubmitting(true);
    else setSaving(true);

    try {
      const instructions = instructionsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 15);

      const existingPaper = activePaperId ? papers.find((p) => p.id === activePaperId) : null;

      let savedPaperId = activePaperId;

      if (existingPaper) {
        const updatePayload: Record<string, unknown> = {
          title: title.trim().slice(0, 150),
          examType: examType.trim().slice(0, 60),
          academicTerm: academicTerm.trim().slice(0, 60),
          durationMinutes: Math.min(Math.max(Number(durationMinutes) || 120, 15), 360),
          totalMarks: audit.totalMarks || plannedTotalMarks || 50,
          instructions,
          sections,
          status: targetStatus,
          updatedAt: serverTimestamp(),
        };
        if (isSubmit) {
          updatePayload.submittedForReviewAt = serverTimestamp();
        }
        await updateDoc(doc(db, 'questionPapers', existingPaper.id), updatePayload);
        savedPaperId = existingPaper.id;
      } else {
        const createdRef = await addDoc(collection(db, 'questionPapers'), {
          title: title.trim().slice(0, 150),
          subjectId: activeSubject.id,
          subjectCode: activeSubject.code,
          subjectName: activeSubject.name,
          examType: examType.trim().slice(0, 60),
          academicTerm: academicTerm.trim().slice(0, 60),
          durationMinutes: Math.min(Math.max(Number(durationMinutes) || 120, 15), 360),
          totalMarks: audit.totalMarks || plannedTotalMarks || 50,
          instructions,
          sections,
          status: 'draft',
          reviewNotes: '',
          reviewerName: 'Examination Controller',
          workspaceScope: 'institutional',
          createdBy: currentUser.uid,
          createdByName: currentUser.displayName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        savedPaperId = createdRef.id;
        setActivePaperId(savedPaperId);

        if (isSubmit) {
          await updateDoc(doc(db, 'questionPapers', savedPaperId), {
            status: 'pending_review',
            submittedForReviewAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      // Increment usageCount / overrideCount on bank questions used
      const bankIds = new Set<string>();
      const overriddenIds = new Set<string>();
      for (const sec of sections) {
        for (const slot of sec.questions) {
          if (questions.some((q) => q.id === slot.questionId)) {
            bankIds.add(slot.questionId);
          }
          if (slot.isManualOverride && slot.originalQuestionId) {
            if (questions.some((q) => q.id === slot.originalQuestionId)) {
              overriddenIds.add(slot.originalQuestionId);
            }
          }
        }
      }

      for (const qId of bankIds) {
        try {
          await updateDoc(doc(db, 'questions', qId), {
            usageCount: increment(1),
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Ignore non-critical metric increment failures
        }
      }
      for (const qId of overriddenIds) {
        try {
          await updateDoc(doc(db, 'questions', qId), {
            overrideCount: increment(1),
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Ignore
        }
      }

      // If submitted for review, trigger automated email notification record
      if (isSubmit && savedPaperId) {
        const resp = await fetch('/api/notifications/send-review-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: 'mukhtar.amir44@gmail.com',
            toName: 'Examination Controller',
            subjectCode: activeSubject.code,
            paperTitle: title.trim(),
            triggerType: 'submission',
            senderName: currentUser.displayName,
          }),
        });
        const emailData = await resp.json();
        if (resp.ok) {
          await addDoc(collection(db, 'reviewNotifications'), {
            paperId: savedPaperId,
            paperTitle: title.trim().slice(0, 150),
            subjectCode: activeSubject.code,
            recipientUid: currentUser.uid,
            recipientName: 'Examination Controller',
            recipientEmail: 'mukhtar.amir44@gmail.com',
            triggerType: 'submission',
            emailSubject: emailData.emailSubject,
            emailBody: emailData.emailBody,
            deliveryStatus: emailData.deliveryStatus,
            deliveryNote: emailData.deliveryNote || '',
            sentBy: currentUser.uid,
            createdAt: serverTimestamp(),
          });
        }
        setStatusMessage(
          'Paper submitted for Exam Controller review and automated notification dispatched.'
        );
      } else {
        setStatusMessage('Question paper saved as draft.');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'questionPapers');
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  };

  const handleExportDocx = async () => {
    if (!activeSubject || sections.length === 0) return;
    setExportingDocx(true);
    try {
      await exportPaperToDocx({
        title,
        subjectCode: activeSubject.code,
        subjectName: activeSubject.name,
        examType,
        academicTerm,
        durationMinutes,
        totalMarks: audit.totalMarks || plannedTotalMarks,
        instructions: instructionsText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
        sections,
        includeBloomsTags,
        includeAnswerKey,
      });
    } finally {
      setExportingDocx(false);
    }
  };

  const handleExportPdf = () => {
    if (!activeSubject || sections.length === 0) return;
    exportPaperToPdf({
      title,
      subjectCode: activeSubject.code,
      subjectName: activeSubject.name,
      examType,
      academicTerm,
      durationMinutes,
      totalMarks: audit.totalMarks || plannedTotalMarks,
      instructions: instructionsText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      sections,
      includeBloomsTags,
      includeAnswerKey,
    });
  };

  const resetNewPaper = () => {
    setActivePaperId(null);
    onClearEditingPaper();
    setSections([]);
    setAssemblyWarnings([]);
    setStatusMessage(null);
    setErrorMsg(null);
  };

  const currentPaperRecord = activePaperId ? papers.find((p) => p.id === activePaperId) : null;
  const isLockedPublished =
    currentPaperRecord?.status === 'published' && effectiveRole !== 'exam_controller';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900">
            Question Paper Studio
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Configure paper format, auto-assemble Bloom&apos;s L2–L4 questions, manually override individual slots, and export Word (.docx) or PDF.
          </p>
        </div>
        {activePaperId && (
          <button
            type="button"
            onClick={resetNewPaper}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Start Fresh Paper
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Paper Blueprint & Assembly Controls */}
        <div className="xl:col-span-5 space-y-5 bg-white border border-slate-200 rounded-xl p-5">
          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              1. Course &amp; Format Setup
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Course</label>
                <select
                  value={subjectId}
                  onChange={(e) => {
                    setSubjectId(e.target.value);
                    setTopicFilter('ALL');
                  }}
                  disabled={isLockedPublished}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Format Blueprint
                </label>
                <select
                  value={templateId}
                  onChange={(e) => handleApplyTemplate(e.target.value)}
                  disabled={isLockedPublished}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Question Paper Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isLockedPublished}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Exam Type</label>
                <input
                  type="text"
                  value={examType}
                  onChange={(e) => setExamType(e.target.value)}
                  disabled={isLockedPublished}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Term</label>
                <input
                  type="text"
                  value={academicTerm}
                  onChange={(e) => setAcademicTerm(e.target.value)}
                  disabled={isLockedPublished}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Duration (min)
                </label>
                <input
                  type="number"
                  min={15}
                  max={360}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  disabled={isLockedPublished}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Candidate Instructions (one per line)
              </label>
              <textarea
                rows={2}
                value={instructionsText}
                onChange={(e) => setInstructionsText(e.target.value)}
                disabled={isLockedPublished}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
              />
            </div>
          </div>

          {/* Section Blueprint Editor */}
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  2. Paper Sections ({plannedTotalMarks} Marks Total)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Available bank questions for {activeSubject?.code}: {subjectQuestions.length}
                </p>
              </div>
              <button
                type="button"
                onClick={addSectionConfig}
                disabled={isLockedPublished}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Section
              </button>
            </div>

            <div className="space-y-2.5">
              {sectionConfigs.map((sec) => (
                <div
                  key={sec.id}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={sec.title}
                      onChange={(e) => updateSectionConfig(sec.id, { title: e.target.value })}
                      className="w-28 px-2 py-1 text-xs font-semibold bg-white border border-slate-200 rounded"
                    />
                    <input
                      type="text"
                      value={sec.description}
                      onChange={(e) =>
                        updateSectionConfig(sec.id, { description: e.target.value })
                      }
                      className="flex-1 px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                    />
                    <button
                      type="button"
                      onClick={() => removeSectionConfig(sec.id)}
                      disabled={sectionConfigs.length <= 1}
                      className="text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500">Questions</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={sec.questionCount}
                        onChange={(e) =>
                          updateSectionConfig(sec.id, {
                            questionCount: Math.max(1, Number(e.target.value)),
                          })
                        }
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500">Attempt</label>
                      <input
                        type="number"
                        min={1}
                        max={sec.questionCount}
                        value={sec.compulsoryCount}
                        onChange={(e) =>
                          updateSectionConfig(sec.id, {
                            compulsoryCount: Math.min(
                              sec.questionCount,
                              Math.max(1, Number(e.target.value))
                            ),
                          })
                        }
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500">Marks Ea.</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={sec.marksPerQuestion}
                        onChange={(e) =>
                          updateSectionConfig(sec.id, {
                            marksPerQuestion: Math.max(1, Number(e.target.value)),
                          })
                        }
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500">Difficulty</label>
                      <select
                        value={sec.preferredDifficulty}
                        onChange={(e) =>
                          updateSectionConfig(sec.id, {
                            preferredDifficulty: e.target.value as Difficulty | 'Mixed',
                          })
                        }
                        className="w-full px-1.5 py-1 text-xs bg-white border border-slate-200 rounded"
                      >
                        <option value="Mixed">Mixed</option>
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Selection Filters */}
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              3. Smart Selection Filters
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Topic Focus</label>
                <select
                  value={topicFilter}
                  onChange={(e) => setTopicFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="ALL">All Course Topics</option>
                  {subjectTopics.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Difficulty</label>
                <select
                  value={difficultyOverride}
                  onChange={(e) =>
                    setDifficultyOverride(e.target.value as Difficulty | 'TemplateDefault')
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="TemplateDefault">Per Section Blueprint</option>
                  <option value="Easy">Easy Only</option>
                  <option value="Medium">Medium Only</option>
                  <option value="Hard">Hard Only</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Bloom&apos;s Focus</label>
                <select
                  value={String(bloomFocus)}
                  onChange={(e) =>
                    setBloomFocus(
                      e.target.value === 'Balanced'
                        ? 'Balanced'
                        : (Number(e.target.value) as BloomLevel)
                    )
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="Balanced">Balanced L2 / L3 / L4</option>
                  <option value="2">Prefer L2 Understand</option>
                  <option value="3">Prefer L3 Apply</option>
                  <option value="4">Prefer L4 Analyze</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAutoAssemble}
              disabled={isLockedPublished || subjectQuestions.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Wand2 className="w-4 h-4" />
              Auto-Assemble Paper from Question Bank
            </button>
          </div>
        </div>

        {/* Right Column: Live Paper Canvas, Manual Overrides & Export */}
        <div className="xl:col-span-7 space-y-5">
          {/* Action & Export Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeBloomsTags}
                  onChange={(e) => setIncludeBloomsTags(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Include Bloom&apos;s tags in export
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAnswerKey}
                  onChange={(e) => setIncludeAnswerKey(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Append marking scheme
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportDocx}
                disabled={sections.length === 0 || exportingDocx}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                {exportingDocx ? 'Exporting...' : 'Download .docx'}
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={sections.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => persistPaper('draft')}
                disabled={saving || submitting || sections.length === 0 || isLockedPublished}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 whitespace-nowrap cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                type="button"
                onClick={() => persistPaper('pending_review')}
                disabled={saving || submitting || sections.length === 0 || isLockedPublished}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                {submitting ? 'Submitting...' : 'Submit for Review'}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {errorMsg}
            </div>
          )}

          {statusMessage && (
            <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {statusMessage}
              </span>
              {currentPaperRecord?.status === 'pending_review' && (
                <button
                  type="button"
                  onClick={onNavigateToReview}
                  className="text-xs font-medium underline whitespace-nowrap cursor-pointer"
                >
                  Open Review Queue
                </button>
              )}
            </div>
          )}

          {assemblyWarnings.length > 0 && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">Assembly Notes:</p>
              {assemblyWarnings.map((w, idx) => (
                <p key={idx}>· {w}</p>
              ))}
            </div>
          )}

          {/* Live Bloom's & Action Verb Audit Strip */}
          {sections.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-display text-xs font-semibold text-slate-900">
                  Bloom&apos;s Taxonomy &amp; Action Verb Audit (Levels 2, 3 &amp; 4)
                </h4>
                <div className="text-xs text-slate-500 tabular-nums">
                  {audit.totalQuestions} questions · {audit.totalMarks} marks ·{' '}
                  {audit.overrideCount} manual overrides
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">L2 Understand</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {audit.percentages[2]}% ({audit.counts[2]})
                    </span>
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">L3 Apply</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {audit.percentages[3]}% ({audit.counts[3]})
                    </span>
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">L4 Analyze</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {audit.percentages[4]}% ({audit.counts[4]})
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                <span className="font-medium text-slate-800">
                  Action Verbs Used ({audit.uniqueVerbs.length} distinct):{' '}
                </span>
                {audit.uniqueVerbs.join(' · ') || 'None'}
              </p>
            </div>
          )}

          {/* Formatted Question Paper Sheet */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {sections.length === 0 ? (
              <div className="p-14 text-center">
                <p className="text-sm font-medium text-slate-900">No question paper assembled yet</p>
                <p className="mt-1.5 text-xs text-slate-500 max-w-md mx-auto">
                  Select your course and format sections on the left, then click &ldquo;Auto-Assemble Paper from Question Bank&rdquo;. You can then manually override any individual question.
                </p>
                <button
                  type="button"
                  onClick={handleAutoAssemble}
                  disabled={subjectQuestions.length === 0}
                  className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Assemble Initial Paper
                </button>
              </div>
            ) : (
              <div className="p-6 sm:p-8 space-y-6">
                {/* Paper Institutional Header Preview */}
                <div className="text-center border-b border-slate-200 pb-5 space-y-1">
                  <p className="text-xs font-semibold tracking-wider text-slate-500">
                    ACADEMIC EXAMINATION BOARD
                  </p>
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    {activeSubject?.code}: {activeSubject?.name}
                  </h3>
                  <p className="text-xs text-slate-600">
                    {examType} · {academicTerm} · {title}
                  </p>
                  <div className="pt-2 flex items-center justify-center gap-6 text-xs font-medium text-slate-700 tabular-nums">
                    <span>Duration: {durationMinutes} Minutes</span>
                    <span>Maximum Marks: {audit.totalMarks}</span>
                  </div>
                </div>

                {/* Sections & Slots */}
                <div className="space-y-6">
                  {sections.map((sec) => {
                    const secMarks = sec.compulsoryCount * sec.marksPerQuestion;
                    return (
                      <div key={sec.id} className="space-y-3">
                        <div className="flex items-baseline justify-between border-b border-slate-900 pb-1.5">
                          <h4 className="font-display text-sm font-bold text-slate-900">
                            {sec.title} — {sec.description}
                          </h4>
                          <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                            [{secMarks} Marks]
                          </span>
                        </div>

                        <div className="divide-y divide-slate-200">
                          {sec.questions.map((slot, idx) => (
                            <div key={slot.slotId} className="py-3.5 flex items-start gap-3">
                              <span className="font-mono text-xs font-semibold text-slate-900 pt-0.5 w-7 shrink-0 tabular-nums">
                                Q{idx + 1}.
                              </span>
                              <div className="flex-1 min-w-0 space-y-1.5">
                                <p className="text-sm text-slate-900 leading-relaxed">
                                  {slot.text}
                                </p>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                  <span>{slot.topic}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-medium text-slate-700">
                                    {getBloomLabel(slot.bloomLevel)}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>Verb: {slot.actionVerb}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{slot.difficulty}</span>
                                  {slot.isManualOverride && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="font-medium text-amber-700">
                                        Manual Override
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-2 shrink-0">
                                <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                                  [{slot.marks} M]
                                </span>
                                {!isLockedPublished && (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => moveSlot(sec.id, idx, -1)}
                                      disabled={idx === 0}
                                      title="Move up"
                                      className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 cursor-pointer"
                                    >
                                      <ArrowUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveSlot(sec.id, idx, 1)}
                                      disabled={idx === sec.questions.length - 1}
                                      title="Move down"
                                      className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 cursor-pointer"
                                    >
                                      <ArrowDown className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openOverridePicker(sec.id, slot)}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer whitespace-nowrap"
                                    >
                                      <Replace className="w-3 h-3" />
                                      Override
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Manual Question Override Drawer / Modal */}
      {overrideTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full max-h-[88vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Manual Question Override
                </h3>
                <p className="text-xs text-slate-500">
                  Select a replacement from {activeSubject?.code} Question Bank or write a custom question override.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOverrideTarget(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 pt-3 border-b border-slate-200 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCustomOverrideMode(false)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                  !customOverrideMode
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Pick from Question Bank ({filteredPickerQuestions.length})
              </button>
              <button
                type="button"
                onClick={() => setCustomOverrideMode(true)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                  customOverrideMode
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Custom Manual Question Text
              </button>
            </div>

            {!customOverrideMode ? (
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Search..."
                    className="sm:col-span-2 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                  <select
                    value={pickerTopic}
                    onChange={(e) => setPickerTopic(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="ALL">All Topics</option>
                    {subjectTopics.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <select
                    value={pickerDifficulty}
                    onChange={(e) => setPickerDifficulty(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="ALL">Any Difficulty</option>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                  <div className="flex gap-1.5">
                    <select
                      value={pickerMarks}
                      onChange={(e) => setPickerMarks(e.target.value)}
                      className="w-1/2 px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg tabular-nums"
                    >
                      <option value="ALL">Any M</option>
                      <option value="2">2 M</option>
                      <option value="5">5 M</option>
                      <option value="10">10 M</option>
                    </select>
                    <select
                      value={pickerBloom}
                      onChange={(e) => setPickerBloom(e.target.value)}
                      className="w-1/2 px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                    >
                      <option value="ALL">L2–L4</option>
                      <option value="2">L2</option>
                      <option value="3">L3</option>
                      <option value="4">L4</option>
                    </select>
                  </div>
                </div>

                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {filteredPickerQuestions.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No matching questions for these filters. Try setting Marks to &ldquo;Any M&rdquo; or switch to Custom Manual Question Text.
                    </div>
                  ) : (
                    filteredPickerQuestions.map((q) => (
                      <div
                        key={q.id}
                        className="p-3.5 flex items-start justify-between gap-4 hover:bg-slate-50 transition-colors"
                      >
                        <div className="space-y-1">
                          <p className="text-sm text-slate-900">{q.text}</p>
                          <p className="text-xs text-slate-500">
                            {q.topic} · {getBloomLabel(q.bloomLevel)} · Verb: {q.actionVerb} ·{' '}
                            {q.difficulty} · {q.marks} Marks
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => applyBankOverride(q)}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Select
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Custom Question Prompt
                  </label>
                  <textarea
                    rows={3}
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Topic</label>
                    <input
                      type="text"
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Bloom&apos;s (2–4)
                    </label>
                    <select
                      value={customBloom}
                      onChange={(e) => setCustomBloom(Number(e.target.value) as BloomLevel)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
                    >
                      <option value={2}>L2 Understand</option>
                      <option value={3}>L3 Apply</option>
                      <option value={4}>L4 Analyze</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Action Verb
                    </label>
                    <input
                      type="text"
                      value={customVerb}
                      onChange={(e) => setCustomVerb(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Difficulty
                    </label>
                    <select
                      value={customDifficulty}
                      onChange={(e) => setCustomDifficulty(e.target.value as Difficulty)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setOverrideTarget(null)}
                    className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyCustomTextOverride}
                    disabled={customText.trim().length < 10}
                    className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                  >
                    Apply Manual Override
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
