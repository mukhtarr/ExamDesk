import { useState } from 'react';
import { BookOpenCheck, ShieldCheck, FileText, BarChart3 } from 'lucide-react';

interface SignInViewProps {
  onSignIn: () => Promise<void>;
  error: string | null;
}

export function SignInView({ onSignIn, error }: SignInViewProps) {
  const [signingIn, setSigningIn] = useState(false);

  const handleClick = async () => {
    setSigningIn(true);
    try {
      await onSignIn();
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left column: Editorial institutional welcome & sign in */}
      <div className="w-full lg:w-[46%] flex flex-col justify-between p-8 sm:p-12 lg:p-16 bg-white border-b lg:border-b-0 lg:border-r border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg border border-slate-200 overflow-hidden bg-white flex items-center justify-center shrink-0">
            <img
              src="/src/assets/images/academic_seal_crest_1795604126662.jpg"
              alt="ExamDesk Institutional Seal"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            ExamDesk
          </span>
        </div>

        <div className="my-12 max-w-md">
          <p className="text-xs font-medium text-slate-500 tracking-wide">
            Academic Examination Cell · Assessment Studio
          </p>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
            Structured question paper generation, built for faculty and exam boards.
          </h1>
          <p className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed">
            Assemble format-compliant examination papers from your curated bank, synthesize Bloom&apos;s Level 2–4 questions directly from uploaded syllabi, and manage review approvals in one calm workspace.
          </p>

          <div className="mt-8 space-y-4 border-t border-slate-200 pt-6">
            <div className="flex items-start gap-3">
              <BookOpenCheck className="w-5 h-5 text-slate-700 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Bloom&apos;s Levels 2, 3 &amp; 4 with Diverse Action Verbs
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automatically balances Understand, Apply, and Analyze prompts across custom mark allocations.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-slate-700 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Manual Question Override &amp; Word / PDF Export
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Swap any auto-selected question by topic, difficulty, or marks and export formatted exam sheets.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-slate-700 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Role-Based Access &amp; Automated Review Reminders
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dedicated controls for Exam Controllers and Subject Owners with automated email alerts.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <BarChart3 className="w-5 h-5 text-slate-700 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Cohort Performance &amp; Question Usage Analytics
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Track student mastery across Bloom&apos;s levels and monitor question reuse patterns.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-6 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="mt-8">
            <button
              type="button"
              onClick={handleClick}
              disabled={signingIn}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-6 py-3 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"
                />
              </svg>
              {signingIn ? 'Signing in...' : 'Sign in with Institutional Google Account'}
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Secure role-based access for Exam Controllers and Subject Owners.
        </p>
      </div>

      {/* Right column: Full-height editorial campus study photography */}
      <div className="hidden lg:block lg:w-[54%] relative bg-slate-900 overflow-hidden">
        <img
          src="/src/assets/images/examdesk_academic_study_1795604126850.jpg"
          alt="University examination hall and academic library desks"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12 text-white max-w-xl">
          <p className="text-xs font-medium text-slate-300">
            Examination Governance &amp; Pedagogy
          </p>
          <p className="mt-2 text-xl font-display font-semibold leading-snug text-white">
            Every paper is audited for Bloom&apos;s cognitive progression, balanced mark distribution, and faculty review readiness before printing.
          </p>
        </div>
      </div>
    </div>
  );
}
