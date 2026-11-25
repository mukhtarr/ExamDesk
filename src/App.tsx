import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  FilePlus2,
  LogOut,
  Settings,
  Sparkles,
} from 'lucide-react';
import { AdminSettings } from './components/AdminSettings';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PaperBuilder } from './components/PaperBuilder';
import { QuestionBank } from './components/QuestionBank';
import { ReviewWorkflow } from './components/ReviewWorkflow';
import { SignInView } from './components/SignInView';
import { SyllabusGenerator } from './components/SyllabusGenerator';
import {
  OperationType,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
} from './lib/firebase';
import { seedInitialWorkspaceIfEmpty } from './lib/seedData';
import type {
  NotificationSetting,
  PaperTemplate,
  Question,
  QuestionPaper,
  ReviewNotification,
  StudentAssessment,
  Subject,
  UserProfile,
  UserRole,
} from './types';

type ActiveTab =
  | 'builder'
  | 'syllabus'
  | 'bank'
  | 'review'
  | 'analytics'
  | 'settings';

const NAV_ITEMS: { id: ActiveTab; label: string; icon: typeof FilePlus2 }[] = [
  { id: 'builder', label: 'Paper Builder', icon: FilePlus2 },
  { id: 'syllabus', label: 'Syllabus AI', icon: Sparkles },
  { id: 'bank', label: 'Question Bank', icon: BookOpen },
  { id: 'review', label: 'Review Cycles', icon: ClipboardCheck },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function WorkspaceApp() {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [rolePreview, setRolePreview] = useState<UserRole | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('builder');
  const [editingPaperId, setEditingPaperId] = useState<string | null>(null);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [templates, setTemplates] = useState<PaperTemplate[]>([]);
  const [papers, setPapers] = useState<QuestionPaper[]>([]);
  const [assessments, setAssessments] = useState<StudentAssessment[]>([]);
  const [notifications, setNotifications] = useState<ReviewNotification[]>([]);
  const [notificationSetting, setNotificationSetting] =
    useState<NotificationSetting | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  if (fatalError) {
    throw fatalError;
  }

  // 1. Auth & User Profile Bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setAuthUser(fbUser);
      if (!fbUser) {
        setUserProfile(null);
        setAuthReady(true);
        return;
      }

      try {
        const userRef = doc(db, 'users', fbUser.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          const profile = snap.data() as UserProfile;
          setUserProfile(profile);
        } else {
          const isInitialAdmin = fbUser.email === 'mukhtar.amir44@gmail.com';
          const newProfile: UserProfile = {
            uid: fbUser.uid,
            displayName: (
              fbUser.displayName ||
              fbUser.email?.split('@')[0] ||
              'Faculty Member'
            ).slice(0, 100),
            email: (fbUser.email || '').slice(0, 150),
            role: isInitialAdmin ? 'exam_controller' : 'subject_owner',
            department: 'Academic Examinations',
            assignedSubjects: [],
          };
          await setDoc(userRef, {
            ...newProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setUserProfile(newProfile);
        }
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.WRITE, `users/${fbUser.uid}`);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
        setAuthReady(true);
        return;
      }

      try {
        await seedInitialWorkspaceIfEmpty(
          fbUser.uid,
          (fbUser.displayName || fbUser.email?.split('@')[0] || 'Coordinator').slice(0, 100)
        );
      } catch (err) {
        setFatalError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  // 2. Real-time Firestore Listeners (only active when authenticated & profile ready)
  useEffect(() => {
    if (!authUser || !userProfile) return;

    const unsubSubjects = onSnapshot(
      query(collection(db, 'subjects'), where('workspaceScope', '==', 'institutional')),
      (snap) => {
        setSubjects(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Subject, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'subjects')
    );

    const unsubQuestions = onSnapshot(
      query(collection(db, 'questions'), where('workspaceScope', '==', 'institutional')),
      (snap) => {
        setQuestions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Question, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'questions')
    );

    const unsubTemplates = onSnapshot(
      query(collection(db, 'paperTemplates'), where('workspaceScope', '==', 'institutional')),
      (snap) => {
        setTemplates(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaperTemplate, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'paperTemplates')
    );

    const unsubPapers = onSnapshot(
      query(collection(db, 'questionPapers'), where('workspaceScope', '==', 'institutional')),
      (snap) => {
        setPapers(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<QuestionPaper, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'questionPapers')
    );

    const unsubAssessments = onSnapshot(
      query(collection(db, 'studentAssessments'), where('workspaceScope', '==', 'institutional')),
      (snap) => {
        setAssessments(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudentAssessment, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'studentAssessments')
    );

    const isTokenAdmin = authUser.email === 'mukhtar.amir44@gmail.com';
    const notifQuery = isTokenAdmin
      ? collection(db, 'reviewNotifications')
      : query(collection(db, 'reviewNotifications'), where('sentBy', '==', authUser.uid));

    const unsubNotifs = onSnapshot(
      notifQuery,
      (snap) => {
        setNotifications(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReviewNotification, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reviewNotifications')
    );

    let unsubSettings = () => {};
    if (userProfile.role === 'exam_controller') {
      unsubSettings = onSnapshot(
        doc(db, 'notificationSettings', 'global'),
        (snap) => {
          if (snap.exists()) {
            setNotificationSetting(snap.data() as NotificationSetting);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, 'notificationSettings/global')
      );
    }

    let unsubUsers = () => {};
    if (isTokenAdmin) {
      unsubUsers = onSnapshot(
        collection(db, 'users'),
        (snap) => {
          setAllUsers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as UserProfile) })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'users')
      );
    }

    return () => {
      unsubSubjects();
      unsubQuestions();
      unsubTemplates();
      unsubPapers();
      unsubAssessments();
      unsubNotifs();
      unsubSettings();
      unsubUsers();
    };
  }, [authUser, userProfile]);

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in failed.');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-600">Preparing ExamDesk workspace...</p>
      </div>
    );
  }

  if (!authUser || !userProfile) {
    return <SignInView onSignIn={handleSignIn} error={authError} />;
  }

  const effectiveRole: UserRole =
    userProfile.role === 'exam_controller' && rolePreview ? rolePreview : userProfile.role;

  const pendingCount = papers.filter((p) => p.status === 'pending_review').length;

  const activeNavTitle =
    NAV_ITEMS.find((item) => item.id === activeTab)?.label || 'Workspace';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between shrink-0">
        <div>
          <div className="h-16 px-5 border-b border-slate-200 flex items-center gap-3">
            <div className="w-8 h-8 rounded-md border border-slate-200 overflow-hidden bg-white shrink-0">
              <img
                src="/src/assets/images/academic_seal_crest_1795604126662.jpg"
                alt="ExamDesk"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              ExamDesk
            </span>
          </div>

          <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center justify-between gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </span>
                  {item.id === 'review' && pendingCount > 0 && (
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        isActive ? 'text-slate-200' : 'text-amber-700 font-semibold'
                      }`}
                    >
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Staff Account & Role Switcher */}
        <div className="hidden lg:block p-4 border-t border-slate-200 space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-900 truncate">
              {userProfile.displayName}
            </p>
            <p className="text-[11px] text-slate-500 truncate">{userProfile.email}</p>
            <p className="mt-1 text-[11px] font-medium text-slate-700">
              Role: {effectiveRole === 'exam_controller' ? 'Exam Controller' : 'Subject Owner'}
            </p>
          </div>

          {userProfile.role === 'exam_controller' && (
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">
                Workspace Role View
              </label>
              <select
                value={effectiveRole}
                onChange={(e) => setRolePreview(e.target.value as UserRole)}
                className="w-full px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md"
              >
                <option value="exam_controller">Exam Controller (Full)</option>
                <option value="subject_owner">Subject Owner (Preview)</option>
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean Top Bar Contract: Breadcrumb on left, 1 primary CTA on right */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 lg:px-8 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-2 text-sm text-slate-500 min-w-0">
            <span className="truncate">ExamDesk</span>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-slate-900 truncate">{activeNavTitle}</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditingPaperId(null);
                setActiveTab('builder');
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              New Question Paper
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'builder' && (
            <PaperBuilder
              subjects={subjects}
              questions={questions}
              templates={templates}
              papers={papers}
              currentUser={userProfile}
              effectiveRole={effectiveRole}
              editingPaperId={editingPaperId}
              onClearEditingPaper={() => setEditingPaperId(null)}
              onNavigateToReview={() => setActiveTab('review')}
            />
          )}

          {activeTab === 'syllabus' && (
            <SyllabusGenerator
              subjects={subjects}
              currentUser={userProfile}
              onSavedToBank={() => {}}
            />
          )}

          {activeTab === 'bank' && (
            <QuestionBank
              questions={questions}
              subjects={subjects}
              currentUser={userProfile}
              effectiveRole={effectiveRole}
            />
          )}

          {activeTab === 'review' && (
            <ReviewWorkflow
              papers={papers}
              notifications={notifications}
              notificationSetting={notificationSetting}
              currentUser={userProfile}
              effectiveRole={effectiveRole}
              onEditPaper={(paperId) => {
                setEditingPaperId(paperId);
                setActiveTab('builder');
              }}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsDashboard
              questions={questions}
              subjects={subjects}
              papers={papers}
              assessments={assessments}
              currentUser={userProfile}
            />
          )}

          {activeTab === 'settings' && (
            <AdminSettings
              subjects={subjects}
              templates={templates}
              users={allUsers}
              currentUser={userProfile}
              effectiveRole={effectiveRole}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WorkspaceApp />
    </ErrorBoundary>
  );
}
