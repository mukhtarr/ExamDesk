import { useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { Edit3, Plus, Search, Trash2, X } from 'lucide-react';
import { BLOOM_LEVELS, getBloomLabel } from '../lib/blooms';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import type { BloomLevel, Difficulty, Question, Subject, UserProfile } from '../types';

interface QuestionBankProps {
  questions: Question[];
  subjects: Subject[];
  currentUser: UserProfile;
  effectiveRole: 'exam_controller' | 'subject_owner';
}

export function QuestionBank({
  questions,
  subjects,
  currentUser,
  effectiveRole,
}: QuestionBankProps) {
  const [subjectFilter, setSubjectFilter] = useState<string>('ALL');
  const [topicFilter, setTopicFilter] = useState<string>('ALL');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('ALL');
  const [marksFilter, setMarksFilter] = useState<string>('ALL');
  const [bloomFilter, setBloomFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields
  const [formSubjectId, setFormSubjectId] = useState(subjects[0]?.id || '');
  if (!formSubjectId && subjects.length > 0) {
    setFormSubjectId(subjects[0].id);
  }
  const [formTopic, setFormTopic] = useState('');
  const [formText, setFormText] = useState('');
  const [formDifficulty, setFormDifficulty] = useState<Difficulty>('Medium');
  const [formMarks, setFormMarks] = useState<number>(5);
  const [formBloom, setFormBloom] = useState<BloomLevel>(3);
  const [formVerb, setFormVerb] = useState('Apply');
  const [formAnswer, setFormAnswer] = useState('');

  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    questions.forEach((q) => {
      if (subjectFilter === 'ALL' || q.subjectId === subjectFilter) {
        set.add(q.topic);
      }
    });
    return Array.from(set).sort();
  }, [questions, subjectFilter]);

  const availableMarks = useMemo(() => {
    const set = new Set<number>();
    questions.forEach((q) => set.add(q.marks));
    return Array.from(set).sort((a, b) => a - b);
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    const qLower = searchQuery.trim().toLowerCase();
    return questions.filter((q) => {
      if (subjectFilter !== 'ALL' && q.subjectId !== subjectFilter) return false;
      if (topicFilter !== 'ALL' && q.topic !== topicFilter) return false;
      if (difficultyFilter !== 'ALL' && q.difficulty !== difficultyFilter) return false;
      if (marksFilter !== 'ALL' && String(q.marks) !== marksFilter) return false;
      if (bloomFilter !== 'ALL' && String(q.bloomLevel) !== bloomFilter) return false;
      if (
        qLower &&
        !q.text.toLowerCase().includes(qLower) &&
        !q.topic.toLowerCase().includes(qLower) &&
        !q.actionVerb.toLowerCase().includes(qLower) &&
        !q.subjectCode.toLowerCase().includes(qLower)
      ) {
        return false;
      }
      return true;
    });
  }, [
    questions,
    subjectFilter,
    topicFilter,
    difficultyFilter,
    marksFilter,
    bloomFilter,
    searchQuery,
  ]);

  const openCreateModal = () => {
    const defaultSubj = subjects.find((s) => s.id === subjectFilter) || subjects[0];
    setEditingQuestion(null);
    setFormSubjectId(defaultSubj?.id || '');
    setFormTopic(defaultSubj?.topics?.[0] || '');
    setFormText('');
    setFormDifficulty('Medium');
    setFormMarks(5);
    setFormBloom(3);
    setFormVerb('Apply');
    setFormAnswer('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (q: Question) => {
    setEditingQuestion(q);
    setFormSubjectId(q.subjectId);
    setFormTopic(q.topic);
    setFormText(q.text);
    setFormDifficulty(q.difficulty);
    setFormMarks(q.marks);
    setFormBloom(q.bloomLevel);
    setFormVerb(q.actionVerb);
    setFormAnswer(q.expectedAnswer || '');
    setFormError(null);
    setModalOpen(true);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const subj = subjects.find((s) => s.id === formSubjectId);
    if (!subj) {
      setFormError('Please select a valid subject.');
      return;
    }
    if (formText.trim().length < 10) {
      setFormError('Question text must be at least 10 characters.');
      return;
    }
    if (!formTopic.trim()) {
      setFormError('Please enter a topic name.');
      return;
    }
    if (!formVerb.trim()) {
      setFormError('Please specify a Bloom action verb.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        subjectId: subj.id,
        subjectCode: subj.code,
        topic: formTopic.trim().slice(0, 120),
        text: formText.trim().slice(0, 2000),
        difficulty: formDifficulty,
        marks: Math.min(Math.max(Math.round(Number(formMarks) || 2), 1), 50),
        bloomLevel: formBloom,
        actionVerb: formVerb.trim().slice(0, 40),
        expectedAnswer: formAnswer.trim().slice(0, 3000),
        source: editingQuestion?.source || ('manual' as const),
        updatedAt: serverTimestamp(),
      };

      if (editingQuestion) {
        await updateDoc(doc(db, 'questions', editingQuestion.id), payload);
      } else {
        await addDoc(collection(db, 'questions'), {
          ...payload,
          usageCount: 0,
          overrideCount: 0,
          workspaceScope: 'institutional',
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
        });
      }
      setModalOpen(false);
    } catch (err) {
      handleFirestoreError(
        err,
        editingQuestion ? OperationType.UPDATE : OperationType.CREATE,
        'questions'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (q: Question) => {
    try {
      await deleteDoc(doc(db, 'questions', q.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `questions/${q.id}`);
    }
  };

  const clearFilters = () => {
    setSubjectFilter('ALL');
    setTopicFilter('ALL');
    setDifficultyFilter('ALL');
    setMarksFilter('ALL');
    setBloomFilter('ALL');
    setSearchQuery('');
  };

  const selectedFormSubject = subjects.find((s) => s.id === formSubjectId);

  return (
    <div className="space-y-6">
      {/* Header & Summary */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900">
            Question Bank
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Filter questions by course, topic, difficulty level, marks, and Bloom&apos;s cognitive level (L2–L4).
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          disabled={subjects.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Question
        </button>
      </div>

      {/* Multi-Attribute Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search question text, topic, or verb..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
            />
          </div>

          <select
            value={subjectFilter}
            onChange={(e) => {
              setSubjectFilter(e.target.value);
              setTopicFilter('ALL');
            }}
            aria-label="Filter by Subject"
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
          >
            <option value="ALL">All Courses</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
          </select>

          <select
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            aria-label="Filter by Topic"
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
          >
            <option value="ALL">All Topics</option>
            {availableTopics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
            aria-label="Filter by Difficulty"
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
          >
            <option value="ALL">All Difficulties</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>

          <div className="flex gap-2">
            <select
              value={marksFilter}
              onChange={(e) => setMarksFilter(e.target.value)}
              aria-label="Filter by Marks"
              className="w-1/2 px-2.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 tabular-nums"
            >
              <option value="ALL">Marks: Any</option>
              {availableMarks.map((m) => (
                <option key={m} value={String(m)}>
                  {m} Marks
                </option>
              ))}
            </select>

            <select
              value={bloomFilter}
              onChange={(e) => setBloomFilter(e.target.value)}
              aria-label="Filter by Bloom's Level"
              className="w-1/2 px-2.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
            >
              <option value="ALL">Bloom: L2–L4</option>
              <option value="2">L2 Understand</option>
              <option value="3">L3 Apply</option>
              <option value="4">L4 Analyze</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span className="tabular-nums">
            Showing <strong className="text-slate-900">{filteredQuestions.length}</strong> of{' '}
            {questions.length} questions
          </span>
          {(subjectFilter !== 'ALL' ||
            topicFilter !== 'ALL' ||
            difficultyFilter !== 'ALL' ||
            marksFilter !== 'ALL' ||
            bloomFilter !== 'ALL' ||
            searchQuery) && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-slate-700 hover:text-slate-900 underline cursor-pointer"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* Question Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredQuestions.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-900">No matching questions found</p>
            <p className="mt-1 text-xs text-slate-500">
              Try widening your topic, difficulty, or marks filters, or generate new questions from a syllabus.
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-4 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Add Question Manually
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Question &amp; Topic</th>
                  <th className="py-3 px-3 whitespace-nowrap">Course</th>
                  <th className="py-3 px-3 whitespace-nowrap">Bloom&apos;s &amp; Verb</th>
                  <th className="py-3 px-3 whitespace-nowrap">Difficulty</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Marks</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Uses</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredQuestions.map((q) => {
                  const canModify =
                    effectiveRole === 'exam_controller' || q.createdBy === currentUser.uid;
                  return (
                    <tr key={q.id} className="hover:bg-slate-50/80 transition-colors align-top">
                      <td className="py-3.5 px-4 max-w-xl">
                        <p className="text-slate-900 leading-relaxed">{q.text}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{q.topic}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {q.source === 'ai_syllabus'
                              ? 'Syllabus AI'
                              : q.source === 'manual'
                              ? 'Manual Entry'
                              : 'Curated Bank'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                        {q.subjectCode}
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="text-xs font-medium text-slate-900">
                          {getBloomLabel(q.bloomLevel)}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Verb: {q.actionVerb}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span
                          className={`text-xs font-medium ${
                            q.difficulty === 'Hard'
                              ? 'text-red-700'
                              : q.difficulty === 'Medium'
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {q.difficulty}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-900 font-medium whitespace-nowrap">
                        {q.marks}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-500 text-xs whitespace-nowrap">
                        {q.usageCount}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {canModify ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(q)}
                              title="Edit question"
                              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(q)}
                              title="Delete question"
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Read only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Question Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h3 className="font-display text-lg font-semibold text-slate-900">
                {editingQuestion ? 'Edit Question' : 'Add Question to Bank'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="mt-5 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Course / Subject
                  </label>
                  <select
                    value={formSubjectId}
                    onChange={(e) => setFormSubjectId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-900"
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
                    Topic
                  </label>
                  <input
                    type="text"
                    list="subject-topics-list"
                    value={formTopic}
                    onChange={(e) => setFormTopic(e.target.value)}
                    placeholder="e.g., Dynamic Programming"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                  <datalist id="subject-topics-list">
                    {(selectedFormSubject?.topics || []).map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Bloom&apos;s Level (2–4 only)
                  </label>
                  <select
                    value={formBloom}
                    onChange={(e) => {
                      const lvl = Number(e.target.value) as BloomLevel;
                      setFormBloom(lvl);
                      setFormVerb(BLOOM_LEVELS[lvl].verbs[0]);
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-900"
                  >
                    <option value={2}>Level 2: Understand</option>
                    <option value={3}>Level 3: Apply</option>
                    <option value={4}>Level 4: Analyze</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Difficulty Level
                  </label>
                  <select
                    value={formDifficulty}
                    onChange={(e) => setFormDifficulty(e.target.value as Difficulty)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-900"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Marks
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={formMarks}
                    onChange={(e) => setFormMarks(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg tabular-nums focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Action Verb ({BLOOM_LEVELS[formBloom].shortLabel})
                </label>
                <input
                  type="text"
                  value={formVerb}
                  onChange={(e) => setFormVerb(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {BLOOM_LEVELS[formBloom].verbs.map((verb) => (
                    <button
                      key={verb}
                      type="button"
                      onClick={() => setFormVerb(verb)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                        formVerb.toLowerCase() === verb.toLowerCase()
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {verb}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Question Prompt
                </label>
                <textarea
                  rows={3}
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  placeholder="Write a clear academic question beginning with or emphasizing the selected action verb..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Expected Answer / Marking Rubric (Optional)
                </label>
                <textarea
                  rows={2}
                  value={formAnswer}
                  onChange={(e) => setFormAnswer(e.target.value)}
                  placeholder="Key points or derivation steps expected for full marks..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Saving...' : editingQuestion ? 'Update Question' : 'Save to Bank'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
