import { useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Plus, Shield, BookOpen, LayoutTemplate } from 'lucide-react';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import type { PaperTemplate, Subject, UserProfile, UserRole } from '../types';

interface AdminSettingsProps {
  subjects: Subject[];
  templates: PaperTemplate[];
  users: UserProfile[];
  currentUser: UserProfile;
  effectiveRole: UserRole;
}

export function AdminSettings({
  subjects,
  templates,
  users,
  currentUser,
  effectiveRole,
}: AdminSettingsProps) {
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [department, setDepartment] = useState('Computer Science');
  const [topicsInput, setTopicsInput] = useState('');
  const [savingCourse, setSavingCourse] = useState(false);

  const [tplName, setTplName] = useState('');
  const [tplDesc, setTplDesc] = useState('');
  const [tplDuration, setTplDuration] = useState(120);
  const [tplQCount, setTplQCount] = useState(5);
  const [tplQMarks, setTplQMarks] = useState(4);
  const [savingTpl, setSavingTpl] = useState(false);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseCode.trim() || !courseName.trim()) return;
    setSavingCourse(true);
    setStatusMsg(null);
    try {
      const topics = topicsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await addDoc(collection(db, 'subjects'), {
        code: courseCode.trim().toUpperCase().slice(0, 20),
        name: courseName.trim().slice(0, 120),
        department: department.trim().slice(0, 100),
        ownerId: currentUser.uid,
        ownerName: currentUser.displayName,
        topics: topics.length > 0 ? topics.slice(0, 30) : ['Unit 1: Core Foundations'],
        syllabusText: '',
        workspaceScope: 'institutional',
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCourseCode('');
      setCourseName('');
      setTopicsInput('');
      setStatusMsg('New course added to institutional catalog.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'subjects');
    } finally {
      setSavingCourse(false);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplName.trim()) return;
    setSavingTpl(true);
    setStatusMsg(null);
    try {
      const totalMarks = tplQCount * tplQMarks;
      await addDoc(collection(db, 'paperTemplates'), {
        name: tplName.trim().slice(0, 120),
        description: tplDesc.trim().slice(0, 500),
        totalMarks,
        durationMinutes: Math.min(Math.max(Number(tplDuration) || 90, 15), 360),
        instructions: [
          'Attempt all questions.',
          'Show all reasoning and derivations clearly.',
        ],
        sections: [
          {
            id: `sec-${Date.now()}`,
            title: 'Section A',
            description: `Core Assessment (${tplQCount} × ${tplQMarks} Marks)`,
            questionCount: tplQCount,
            marksPerQuestion: tplQMarks,
            compulsoryCount: tplQCount,
            preferredDifficulty: 'Mixed',
            allowedBloomLevels: [2, 3, 4],
          },
        ],
        workspaceScope: 'institutional',
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTplName('');
      setTplDesc('');
      setStatusMsg('Question paper format blueprint saved.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'paperTemplates');
    } finally {
      setSavingTpl(false);
    }
  };

  const handleChangeUserRole = async (targetUid: string, newRole: UserRole) => {
    if (effectiveRole !== 'exam_controller') return;
    try {
      await updateDoc(doc(db, 'users', targetUid), {
        role: newRole,
        updatedAt: serverTimestamp(),
      });
      setStatusMsg('Staff role updated.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900">
          Courses, Formats &amp; Access Control
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Manage academic courses, reusable question paper format templates, and staff role assignments.
        </p>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          {statusMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Course Catalog Management */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-slate-800" />
            <h3 className="font-display text-base font-semibold text-slate-900">
              Courses &amp; Subject Owners ({subjects.length})
            </h3>
          </div>

          <form onSubmit={handleAddSubject} className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-800">Add New Course</p>
            <div className="grid grid-cols-3 gap-2.5">
              <input
                type="text"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                placeholder="Code (e.g. ME-302)"
                required
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
              />
              <input
                type="text"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="Course Title"
                required
                className="col-span-2 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Department"
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
              />
              <input
                type="text"
                value={topicsInput}
                onChange={(e) => setTopicsInput(e.target.value)}
                placeholder="Topics (comma separated)"
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
              />
            </div>
            <button
              type="submit"
              disabled={savingCourse}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {savingCourse ? 'Adding...' : 'Add Course'}
            </button>
          </form>

          <div className="divide-y divide-slate-200 border-t border-slate-200">
            {subjects.map((s) => (
              <div key={s.id} className="py-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {s.code} · {s.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {s.department} · Owner: {s.ownerName} · {s.topics.length} topics
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Paper Format Blueprints */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4 text-slate-800" />
            <h3 className="font-display text-base font-semibold text-slate-900">
              Question Paper Format Blueprints ({templates.length})
            </h3>
          </div>

          <form onSubmit={handleCreateTemplate} className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-800">Create Quick Format Blueprint</p>
            <input
              type="text"
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="Blueprint Name (e.g. Quiz Format 20 Marks)"
              required
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
            />
            <input
              type="text"
              value={tplDesc}
              onChange={(e) => setTplDesc(e.target.value)}
              placeholder="Short description"
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500">Questions</label>
                <input
                  type="number"
                  min={1}
                  max={25}
                  value={tplQCount}
                  onChange={(e) => setTplQCount(Number(e.target.value))}
                  className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500">Marks Each</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={tplQMarks}
                  onChange={(e) => setTplQMarks(Number(e.target.value))}
                  className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500">Duration (min)</label>
                <input
                  type="number"
                  min={15}
                  max={360}
                  value={tplDuration}
                  onChange={(e) => setTplDuration(Number(e.target.value))}
                  className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded tabular-nums"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={savingTpl}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {savingTpl ? 'Saving...' : 'Save Blueprint'}
            </button>
          </form>

          <div className="divide-y divide-slate-200 border-t border-slate-200">
            {templates.map((t) => (
              <div key={t.id} className="py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                  <span className="font-mono text-xs text-slate-700 tabular-nums">
                    {t.totalMarks} Marks · {t.durationMinutes} min
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Role-Based Access Control Directory */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-800" />
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Role-Based Access Control (Exam Controller &amp; Subject Owners)
              </h3>
              <p className="text-xs text-slate-500">
                Your signed-in role:{' '}
                <strong className="text-slate-900">
                  {currentUser.role === 'exam_controller' ? 'Exam Controller' : 'Subject Owner'}
                </strong>
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-3 px-6">Staff Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-6 text-right">Assigned Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {(users.length > 0 ? users : [currentUser]).map((u) => (
                <tr key={u.uid}>
                  <td className="py-3.5 px-6 font-medium text-slate-900">{u.displayName}</td>
                  <td className="py-3.5 px-4 text-slate-600">{u.email}</td>
                  <td className="py-3.5 px-4 text-slate-600">{u.department}</td>
                  <td className="py-3.5 px-6 text-right">
                    {effectiveRole === 'exam_controller' && u.email !== 'mukhtar.amir44@gmail.com' ? (
                      <select
                        value={u.role}
                        onChange={(e) => handleChangeUserRole(u.uid, e.target.value as UserRole)}
                        className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md"
                      >
                        <option value="subject_owner">Subject Owner</option>
                        <option value="exam_controller">Exam Controller</option>
                      </select>
                    ) : (
                      <span className="font-medium text-slate-800">
                        {u.role === 'exam_controller' ? 'Exam Controller' : 'Subject Owner'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
