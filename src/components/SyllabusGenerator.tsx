import { useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Check, FileUp, Plus, Sparkles, Trash2 } from 'lucide-react';
import { getBloomLabel } from '../lib/blooms';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import type {
  BloomLevel,
  Difficulty,
  MarkBucketRequest,
  Subject,
  UserProfile,
} from '../types';

interface GeneratedDraftQuestion {
  id: string;
  selected: boolean;
  text: string;
  topic: string;
  marks: number;
  difficulty: Difficulty;
  bloomLevel: BloomLevel;
  actionVerb: string;
  expectedAnswer: string;
}

interface SyllabusGeneratorProps {
  subjects: Subject[];
  currentUser: UserProfile;
  onSavedToBank: () => void;
}

export function SyllabusGenerator({
  subjects,
  currentUser,
  onSavedToBank,
}: SyllabusGeneratorProps) {
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjects[0]?.id || '');
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [syllabusText, setSyllabusText] = useState(subjects[0]?.syllabusText || '');
  const [markBuckets, setMarkBuckets] = useState<MarkBucketRequest[]>([
    { id: 'b1', count: 3, marks: 2, difficulty: 'Easy', topic: '' },
    { id: 'b2', count: 2, marks: 5, difficulty: 'Medium', topic: '' },
    { id: 'b3', count: 2, marks: 10, difficulty: 'Hard', topic: '' },
  ]);

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [detectedTopics, setDetectedTopics] = useState<string[]>([]);
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedDraftQuestion[]>([]);

  const activeSubject = subjects.find((s) => s.id === selectedSubjectId) || subjects[0];

  if (!selectedSubjectId && subjects.length > 0) {
    setSelectedSubjectId(subjects[0].id);
    if (!syllabusText && subjects[0].syllabusText) {
      setSyllabusText(subjects[0].syllabusText);
    }
  }

  const handleSubjectChange = (newId: string) => {
    setSelectedSubjectId(newId);
    const subj = subjects.find((s) => s.id === newId);
    if (subj && subj.syllabusText) {
      setSyllabusText(subj.syllabusText);
    }
  };

  const addBucket = () => {
    setMarkBuckets((prev) => [
      ...prev,
      {
        id: `b-${Date.now()}`,
        count: 2,
        marks: 4,
        difficulty: 'Mixed',
        topic: '',
      },
    ]);
  };

  const updateBucket = (id: string, patch: Partial<MarkBucketRequest>) => {
    setMarkBuckets((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const removeBucket = (id: string) => {
    if (markBuckets.length <= 1) return;
    setMarkBuckets((prev) => prev.filter((b) => b.id !== id));
  };

  const totalRequestedMarks = markBuckets.reduce((sum, b) => sum + b.count * b.marks, 0);
  const totalRequestedQuestions = markBuckets.reduce((sum, b) => sum + b.count, 0);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!activeSubject) {
      setError('Please add or select a subject first.');
      return;
    }
    if (!syllabusFile && syllabusText.trim().length < 20) {
      setError('Please upload a syllabus file (.pdf, .docx, .txt) or paste syllabus text.');
      return;
    }

    setGenerating(true);
    try {
      const formData = new FormData();
      formData.append('subjectCode', activeSubject.code);
      formData.append('subjectName', activeSubject.name);
      formData.append('syllabusText', syllabusText);
      formData.append(
        'requests',
        JSON.stringify(
          markBuckets.map((b) => ({
            count: b.count,
            marks: b.marks,
            difficulty: b.difficulty,
            topic: b.topic,
          }))
        )
      );
      if (syllabusFile) {
        formData.append('syllabusFile', syllabusFile);
      }

      const resp = await fetch('/api/syllabus/generate', {
        method: 'POST',
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to generate questions.');
      }

      if (data.extractedSyllabusText && !syllabusText.trim()) {
        setSyllabusText(data.extractedSyllabusText);
      }
      setDetectedTopics(data.detectedTopics || []);
      setGeneratedQuestions(
        (data.questions || []).map(
          (
            q: {
              text: string;
              topic: string;
              marks: number;
              difficulty: Difficulty;
              bloomLevel: BloomLevel;
              actionVerb: string;
              expectedAnswer: string;
            },
            idx: number
          ) => ({
            id: `gen-${Date.now()}-${idx}`,
            selected: true,
            ...q,
          })
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Question generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveSelected = async () => {
    if (!activeSubject) return;
    const toSave = generatedQuestions.filter((q) => q.selected);
    if (toSave.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      for (const q of toSave) {
        await addDoc(collection(db, 'questions'), {
          subjectId: activeSubject.id,
          subjectCode: activeSubject.code,
          topic: q.topic.slice(0, 120),
          text: q.text.slice(0, 2000),
          difficulty: q.difficulty,
          marks: q.marks,
          bloomLevel: q.bloomLevel,
          actionVerb: q.actionVerb.slice(0, 40),
          expectedAnswer: q.expectedAnswer.slice(0, 3000),
          source: 'ai_syllabus',
          usageCount: 0,
          overrideCount: 0,
          workspaceScope: 'institutional',
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // Optionally sync detected topics back onto the subject if owner/controller
      const mergedTopics = Array.from(
        new Set([...(activeSubject.topics || []), ...detectedTopics])
      ).slice(0, 30);

      if (mergedTopics.length > (activeSubject.topics?.length || 0)) {
        try {
          await updateDoc(doc(db, 'subjects', activeSubject.id), {
            topics: mergedTopics,
            syllabusText: syllabusText.slice(0, 50000),
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Non-owner might not have subject update permission; questions are saved
        }
      }

      setSuccessMsg(
        `Saved ${toSave.length} Bloom's L2–L4 questions to ${activeSubject.code} Question Bank.`
      );
      setGeneratedQuestions([]);
      onSavedToBank();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'questions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900">
          Syllabus Upload &amp; Question Generator
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload a course syllabus and specify your mark distribution. Every generated question enforces Bloom&apos;s Level 2 (Understand), Level 3 (Apply), or Level 4 (Analyze) with varied action verbs.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Input Form */}
        <form
          onSubmit={handleGenerate}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5"
        >
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Target Course
            </label>
            <select
              value={selectedSubjectId}
              onChange={(e) => handleSubjectChange(e.target.value)}
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
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Upload Syllabus File (PDF, DOCX, TXT, MD)
            </label>
            <label className="flex flex-col items-center justify-center px-4 py-5 border border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100/70 transition-colors cursor-pointer text-center">
              <FileUp className="w-5 h-5 text-slate-500 mb-1.5" />
              <span className="text-xs font-medium text-slate-800">
                {syllabusFile ? syllabusFile.name : 'Choose a syllabus file or drop here'}
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5">
                Max 10 MB · PDF, Word (.docx), or plain text
              </span>
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md,.csv"
                onChange={(e) => setSyllabusFile(e.target.files?.[0] || null)}
                className="sr-only"
              />
            </label>
            {syllabusFile && (
              <button
                type="button"
                onClick={() => setSyllabusFile(null)}
                className="mt-1.5 text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                Remove attached file
              </button>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-700">
                Syllabus Content / Unit Outline
              </label>
              {activeSubject?.syllabusText && (
                <button
                  type="button"
                  onClick={() => setSyllabusText(activeSubject.syllabusText)}
                  className="text-xs text-slate-600 hover:text-slate-900 underline cursor-pointer"
                >
                  Load saved outline
                </button>
              )}
            </div>
            <textarea
              rows={5}
              value={syllabusText}
              onChange={(e) => setSyllabusText(e.target.value)}
              placeholder="Paste syllabus units, learning outcomes, or topics here (optional if uploading a PDF/DOCX)..."
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
            />
          </div>

          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-slate-900">
                  Marks &amp; Question Count Specification
                </h3>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {totalRequestedQuestions} questions · {totalRequestedMarks} total marks
                </p>
              </div>
              <button
                type="button"
                onClick={addBucket}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Row
              </button>
            </div>

            <div className="space-y-2">
              {markBuckets.map((bucket) => (
                <div
                  key={bucket.id}
                  className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-200"
                >
                  <div className="col-span-3">
                    <label className="block text-[10px] text-slate-500">Questions</label>
                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={bucket.count}
                      onChange={(e) =>
                        updateBucket(bucket.id, { count: Math.max(1, Number(e.target.value)) })
                      }
                      className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded tabular-nums"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] text-slate-500">Marks Each</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={bucket.marks}
                      onChange={(e) =>
                        updateBucket(bucket.id, { marks: Math.max(1, Number(e.target.value)) })
                      }
                      className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded tabular-nums"
                    />
                  </div>
                  <div className="col-span-5">
                    <label className="block text-[10px] text-slate-500">Difficulty</label>
                    <select
                      value={bucket.difficulty}
                      onChange={(e) =>
                        updateBucket(bucket.id, {
                          difficulty: e.target.value as Difficulty | 'Mixed',
                        })
                      }
                      className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                    >
                      <option value="Mixed">Mixed</option>
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                  <div className="col-span-1 flex justify-end pt-3">
                    <button
                      type="button"
                      onClick={() => removeBucket(bucket.id)}
                      disabled={markBuckets.length <= 1}
                      className="text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="col-span-12">
                    <input
                      type="text"
                      value={bucket.topic}
                      onChange={(e) => updateBucket(bucket.id, { topic: e.target.value })}
                      placeholder="Optional topic focus (e.g. Dynamic Programming)"
                      className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              {successMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={generating || !activeSubject}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            {generating ? 'Synthesizing Bloom L2–L4 Questions...' : 'Generate Questions from Syllabus'}
          </button>
        </form>

        {/* Right: Generated Preview & Bank Save */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Generated Questions Preview
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {generatedQuestions.length > 0
                  ? `${generatedQuestions.filter((q) => q.selected).length} of ${generatedQuestions.length} selected · Bloom's Levels 2, 3 & 4 verified`
                  : 'Generated questions will appear here for review before saving to the Question Bank.'}
              </p>
            </div>
            {generatedQuestions.length > 0 && (
              <button
                type="button"
                onClick={handleSaveSelected}
                disabled={saving || generatedQuestions.every((q) => !q.selected)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save Selected to Bank'}
              </button>
            )}
          </div>

          {generatedQuestions.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-slate-800">Ready to synthesize from syllabus</p>
              <p className="mt-1.5 text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Upload your course syllabus PDF, Word document, or unit outline on the left, set your desired mark buckets, and click Generate.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {detectedTopics.length > 0 && (
                <div className="px-5 py-3 bg-slate-50 text-xs text-slate-600">
                  <span className="font-medium text-slate-800">Detected Syllabus Topics: </span>
                  {detectedTopics.join(' · ')}
                </div>
              )}
              {generatedQuestions.map((q, idx) => (
                <div key={q.id} className="p-5 space-y-2.5 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={q.selected}
                      onChange={(e) =>
                        setGeneratedQuestions((prev) =>
                          prev.map((item) =>
                            item.id === q.id ? { ...item, selected: e.target.checked } : item
                          )
                        )
                      }
                      className="mt-1 rounded border-slate-300"
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-slate-900">Q{idx + 1}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-slate-800">{getBloomLabel(q.bloomLevel)}</span>
                          <span aria-hidden="true">·</span>
                          <span>Verb: {q.actionVerb}</span>
                          <span aria-hidden="true">·</span>
                          <span>{q.difficulty}</span>
                        </div>
                        <span className="font-mono font-semibold text-slate-900 tabular-nums">
                          {q.marks} Marks
                        </span>
                      </div>

                      <textarea
                        rows={2}
                        value={q.text}
                        onChange={(e) =>
                          setGeneratedQuestions((prev) =>
                            prev.map((item) =>
                              item.id === q.id ? { ...item, text: e.target.value } : item
                            )
                          )
                        }
                        className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                      />

                      <div className="text-xs text-slate-600">
                        <span className="font-medium text-slate-700">Topic: </span>
                        {q.topic}
                      </div>

                      {q.expectedAnswer && (
                        <div className="text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                          <span className="font-medium text-slate-700">Marking Rubric: </span>
                          {q.expectedAnswer}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
