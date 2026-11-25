import { useMemo, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Plus, X } from 'lucide-react';
import { getBloomLabel } from '../lib/blooms';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import type {
  Question,
  QuestionPaper,
  StudentAssessment,
  Subject,
  UserProfile,
} from '../types';

interface AnalyticsDashboardProps {
  questions: Question[];
  subjects: Subject[];
  papers: QuestionPaper[];
  assessments: StudentAssessment[];
  currentUser: UserProfile;
}

export function AnalyticsDashboard({
  questions,
  subjects,
  papers,
  assessments,
  currentUser,
}: AnalyticsDashboardProps) {
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Record assessment form
  const [formSubjectId, setFormSubjectId] = useState(subjects[0]?.id || '');
  if (!formSubjectId && subjects.length > 0) {
    setFormSubjectId(subjects[0].id);
  }
  const [formCohort, setFormCohort] = useState('B.Tech CSE Sem V · Batch B');
  const [formPaperTitle, setFormPaperTitle] = useState('End-Semester Assessment');
  const [formDate, setFormDate] = useState('2026-11-20');
  const [formCount, setFormCount] = useState(60);
  const [formAvg, setFormAvg] = useState(76);
  const [formPassRate, setFormPassRate] = useState(92);
  const [formL2, setFormL2] = useState(85);
  const [formL3, setFormL3] = useState(75);
  const [formL4, setFormL4] = useState(66);

  const filteredQuestions = useMemo(() => {
    if (selectedSubjectFilter === 'ALL') return questions;
    return questions.filter((q) => q.subjectId === selectedSubjectFilter);
  }, [questions, selectedSubjectFilter]);

  const filteredAssessments = useMemo(() => {
    if (selectedSubjectFilter === 'ALL') return assessments;
    return assessments.filter((a) => a.subjectId === selectedSubjectFilter);
  }, [assessments, selectedSubjectFilter]);

  const metrics = useMemo(() => {
    const totalStudents = filteredAssessments.reduce((s, a) => s + a.studentCount, 0);
    const weightedScore =
      totalStudents > 0
        ? filteredAssessments.reduce((s, a) => s + a.averageScore * a.studentCount, 0) /
          totalStudents
        : 0;
    const weightedPass =
      totalStudents > 0
        ? filteredAssessments.reduce((s, a) => s + a.passRate * a.studentCount, 0) / totalStudents
        : 0;

    const totalUses = filteredQuestions.reduce((s, q) => s + q.usageCount, 0);
    const totalOverrides = filteredQuestions.reduce((s, q) => s + q.overrideCount, 0);
    const overrideRate = totalUses > 0 ? Math.round((totalOverrides / totalUses) * 100) : 0;

    const bloomCounts = { 2: 0, 3: 0, 4: 0 };
    const diffCounts = { Easy: 0, Medium: 0, Hard: 0 };
    const verbSet = new Set<string>();

    filteredQuestions.forEach((q) => {
      if (q.bloomLevel === 2 || q.bloomLevel === 3 || q.bloomLevel === 4) {
        bloomCounts[q.bloomLevel] += 1;
      }
      diffCounts[q.difficulty] += 1;
      if (q.actionVerb) verbSet.add(q.actionVerb.toLowerCase());
    });

    const bloomAttainAvg =
      filteredAssessments.length > 0
        ? {
            l2: Math.round(
              filteredAssessments.reduce((s, a) => s + (a.bloomAttainment?.l2 || 0), 0) /
                filteredAssessments.length
            ),
            l3: Math.round(
              filteredAssessments.reduce((s, a) => s + (a.bloomAttainment?.l3 || 0), 0) /
                filteredAssessments.length
            ),
            l4: Math.round(
              filteredAssessments.reduce((s, a) => s + (a.bloomAttainment?.l4 || 0), 0) /
                filteredAssessments.length
            ),
          }
        : { l2: 0, l3: 0, l4: 0 };

    return {
      totalQuestions: filteredQuestions.length,
      totalStudents,
      avgScore: weightedScore.toFixed(1),
      passRate: weightedPass.toFixed(1),
      overrideRate,
      totalUses,
      bloomCounts,
      diffCounts,
      uniqueVerbCount: verbSet.size,
      bloomAttainAvg,
    };
  }, [filteredAssessments, filteredQuestions]);

  const topUsedQuestions = useMemo(
    () => [...filteredQuestions].sort((a, b) => b.usageCount - a.usageCount).slice(0, 6),
    [filteredQuestions]
  );

  const handleRecordResult = async (e: React.FormEvent) => {
    e.preventDefault();
    const subj = subjects.find((s) => s.id === formSubjectId);
    if (!subj) return;

    setSaving(true);
    try {
      const topicMastery = (subj.topics || ['Core Concepts']).slice(0, 5).map((t, idx) => ({
        topic: t,
        avgPercent: Math.max(40, Math.min(98, Math.round(formAvg + (idx % 2 === 0 ? 4 : -5)))),
      }));

      await addDoc(collection(db, 'studentAssessments'), {
        subjectId: subj.id,
        subjectCode: subj.code,
        paperId: papers.find((p) => p.subjectId === subj.id)?.id || 'manual',
        paperTitle: formPaperTitle.trim().slice(0, 150),
        cohort: formCohort.trim().slice(0, 80),
        examDate: formDate,
        studentCount: Math.max(1, Math.round(formCount)),
        averageScore: Math.min(100, Math.max(0, Number(formAvg))),
        passRate: Math.min(100, Math.max(0, Number(formPassRate))),
        bloomAttainment: {
          l2: Math.min(100, Math.max(0, Number(formL2))),
          l3: Math.min(100, Math.max(0, Number(formL3))),
          l4: Math.min(100, Math.max(0, Number(formL4))),
        },
        topicMastery,
        workspaceScope: 'institutional',
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'studentAssessments');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900">
            Student Performance &amp; Question Usage Analytics
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Monitor cohort score attainment across Bloom&apos;s Levels 2–4 alongside question reuse and override frequency.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedSubjectFilter}
            onChange={(e) => setSelectedSubjectFilter(e.target.value)}
            aria-label="Filter analytics by course"
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg"
          >
            <option value="ALL">All Courses</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={subjects.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Exam Results
          </button>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Mean Cohort Score</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {metrics.avgScore}%
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Across {metrics.totalStudents} evaluated students
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Overall Pass Rate</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-emerald-700 tabular-nums">
            {metrics.passRate}%
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {filteredAssessments.length} recorded exam cohorts
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Question Bank Coverage</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {metrics.totalQuestions}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {metrics.uniqueVerbCount} distinct Bloom L2–L4 verbs
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Manual Override Ratio</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {metrics.overrideRate}%
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {metrics.totalUses} total paper slot appearances
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Student Performance Chart & Bloom Attainment */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Cohort Performance &amp; Bloom&apos;s Attainment
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Average student score and pass rate by examination batch
              </p>
            </div>
          </div>

          {filteredAssessments.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No student assessment batches logged for this course yet.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAssessments.map((a) => (
                <div key={a.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-900">
                      {a.subjectCode} · {a.cohort}
                    </span>
                    <span className="font-mono text-slate-700 tabular-nums">
                      Avg {a.averageScore}% · Pass {a.passRate}% ({a.studentCount} students)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-slate-900"
                      style={{ width: `${Math.min(100, Math.max(0, a.averageScore))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-slate-200 pt-5 space-y-3">
            <h4 className="text-xs font-semibold text-slate-900">
              Cognitive Attainment by Bloom&apos;s Taxonomy Level
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-500">Level 2 · Understand</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                  {metrics.bloomAttainAvg.l2}%
                </p>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-500">Level 3 · Apply</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                  {metrics.bloomAttainAvg.l3}%
                </p>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-500">Level 4 · Analyze</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
                  {metrics.bloomAttainAvg.l4}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Question Bank Distribution */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Question Bank Composition
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Distribution across Bloom&apos;s L2–L4 and difficulty tiers
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-700">By Bloom&apos;s Taxonomy</p>
            {([2, 3, 4] as const).map((lvl) => {
              const count = metrics.bloomCounts[lvl];
              const pct =
                metrics.totalQuestions > 0
                  ? Math.round((count / metrics.totalQuestions) * 100)
                  : 0;
              return (
                <div key={lvl} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-700">{getBloomLabel(lvl)}</span>
                    <span className="font-mono text-slate-900 tabular-nums">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-800" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-200 pt-4 space-y-3">
            <p className="text-xs font-semibold text-slate-700">By Difficulty Tier</p>
            {(['Easy', 'Medium', 'Hard'] as const).map((diff) => {
              const count = metrics.diffCounts[diff];
              const pct =
                metrics.totalQuestions > 0
                  ? Math.round((count / metrics.totalQuestions) * 100)
                  : 0;
              const barColor =
                diff === 'Easy'
                  ? 'bg-emerald-600'
                  : diff === 'Medium'
                  ? 'bg-amber-600'
                  : 'bg-red-600';
              return (
                <div key={diff} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-700">{diff}</span>
                    <span className="font-mono text-slate-900 tabular-nums">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Question Usage & Override Patterns Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Question Usage &amp; Override Patterns
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Identify heavily reused items to rotate fresh syllabus-generated questions in upcoming terms.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-3 px-6">Question</th>
                <th className="py-3 px-3">Course &amp; Topic</th>
                <th className="py-3 px-3">Bloom&apos;s</th>
                <th className="py-3 px-3 text-right">Marks</th>
                <th className="py-3 px-3 text-right">Paper Uses</th>
                <th className="py-3 px-6 text-right">Overrides</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {topUsedQuestions.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50">
                  <td className="py-3 px-6 text-slate-900 max-w-md truncate">{q.text}</td>
                  <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                    {q.subjectCode} · {q.topic}
                  </td>
                  <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                    L{q.bloomLevel} ({q.actionVerb})
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">{q.marks}</td>
                  <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                    {q.usageCount}
                  </td>
                  <td className="py-3 px-6 text-right font-mono text-slate-600 tabular-nums">
                    {q.overrideCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Exam Results Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Record Cohort Assessment Results
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleRecordResult} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Course</label>
                  <select
                    value={formSubjectId}
                    onChange={(e) => setFormSubjectId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
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
                    Exam Date
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cohort</label>
                  <input
                    type="text"
                    value={formCohort}
                    onChange={(e) => setFormCohort(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Paper Title
                  </label>
                  <input
                    type="text"
                    value={formPaperTitle}
                    onChange={(e) => setFormPaperTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Students</label>
                  <input
                    type="number"
                    min={1}
                    max={2000}
                    value={formCount}
                    onChange={(e) => setFormCount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Avg Score (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formAvg}
                    onChange={(e) => setFormAvg(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Pass Rate (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formPassRate}
                    onChange={(e) => setFormPassRate(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    L2 Understand (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formL2}
                    onChange={(e) => setFormL2(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    L3 Apply (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formL3}
                    onChange={(e) => setFormL3(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    L4 Analyze (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formL4}
                    onChange={(e) => setFormL4(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg tabular-nums"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Assessment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
