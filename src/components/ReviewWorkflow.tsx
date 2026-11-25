import { useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  BellRing,
  Check,
  Download,
  Edit3,
  FileText,
  Lock,
  Mail,
  RotateCcw,
} from 'lucide-react';
import { auditPaperBlooms, getBloomLabel } from '../lib/blooms';
import { exportPaperToDocx, exportPaperToPdf } from '../lib/exporters';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import type {
  NotificationSetting,
  PaperStatus,
  QuestionPaper,
  ReviewNotification,
  UserProfile,
} from '../types';

interface ReviewWorkflowProps {
  papers: QuestionPaper[];
  notifications: ReviewNotification[];
  notificationSetting: NotificationSetting | null;
  currentUser: UserProfile;
  effectiveRole: 'exam_controller' | 'subject_owner';
  onEditPaper: (paperId: string) => void;
}

const STATUS_LABELS: Record<PaperStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending Review',
  changes_requested: 'Changes Requested',
  approved: 'Approved',
  published: 'Published & Locked',
};

export function ReviewWorkflow({
  papers,
  notifications,
  notificationSetting,
  currentUser,
  effectiveRole,
  onEditPaper,
}: ReviewWorkflowProps) {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(papers[0]?.id || null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [recipientEmail, setRecipientEmail] = useState(
    notificationSetting?.controllerEmail || currentUser.email
  );
  const [thresholdDays, setThresholdDays] = useState(
    notificationSetting?.pendingThresholdDays || 2
  );
  const [autoRemindEnabled, setAutoRemindEnabled] = useState(
    notificationSetting?.autoRemindEnabled ?? true
  );
  const [processing, setProcessing] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [expandedNotifId, setExpandedNotifId] = useState<string | null>(null);

  const filteredPapers = useMemo(() => {
    if (statusFilter === 'ALL') return papers;
    return papers.filter((p) => p.status === statusFilter);
  }, [papers, statusFilter]);

  const selectedPaper =
    papers.find((p) => p.id === selectedPaperId) || filteredPapers[0] || null;

  const pendingPapers = useMemo(
    () => papers.filter((p) => p.status === 'pending_review'),
    [papers]
  );

  const dispatchEmailAndLog = async (params: {
    paper: QuestionPaper;
    triggerType: 'submission' | 'reminder_overdue' | 'changes_requested' | 'approved';
    toEmail: string;
    toName: string;
    notes?: string;
  }) => {
    const resp = await fetch('/api/notifications/send-review-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toEmail: params.toEmail,
        toName: params.toName,
        subjectCode: params.paper.subjectCode,
        paperTitle: params.paper.title,
        triggerType: params.triggerType,
        reviewNotes: params.notes || '',
        senderName: currentUser.displayName,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || 'Email dispatch failed');
    }

    await addDoc(collection(db, 'reviewNotifications'), {
      paperId: params.paper.id,
      paperTitle: params.paper.title,
      subjectCode: params.paper.subjectCode,
      recipientUid: params.paper.createdBy || currentUser.uid,
      recipientName: params.toName,
      recipientEmail: params.toEmail,
      triggerType: params.triggerType,
      emailSubject: data.emailSubject,
      emailBody: data.emailBody,
      deliveryStatus: data.deliveryStatus,
      deliveryNote: data.deliveryNote || '',
      sentBy: currentUser.uid,
      createdAt: serverTimestamp(),
    });

    return data;
  };

  const handleReviewDecision = async (newStatus: 'approved' | 'changes_requested' | 'published') => {
    if (!selectedPaper || effectiveRole !== 'exam_controller') return;
    setProcessing(true);
    setBannerMsg(null);
    try {
      await updateDoc(doc(db, 'questionPapers', selectedPaper.id), {
        status: newStatus,
        reviewNotes: reviewNotes.trim(),
        reviewerName: currentUser.displayName,
        updatedAt: serverTimestamp(),
      });

      if (newStatus === 'approved' || newStatus === 'changes_requested') {
        await dispatchEmailAndLog({
          paper: selectedPaper,
          triggerType: newStatus,
          toEmail: recipientEmail || currentUser.email,
          toName: selectedPaper.createdByName || 'Subject Owner',
          notes: reviewNotes.trim(),
        });
      }

      setBannerMsg(
        `Paper updated to "${STATUS_LABELS[newStatus]}"${
          newStatus !== 'published' ? ' and notification email logged.' : '.'
        }`
      );
      setReviewNotes('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `questionPapers/${selectedPaper.id}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleSendPendingReminder = async (paper: QuestionPaper) => {
    setProcessing(true);
    setBannerMsg(null);
    try {
      const targetEmail = recipientEmail.trim() || currentUser.email;
      const result = await dispatchEmailAndLog({
        paper,
        triggerType: 'reminder_overdue',
        toEmail: targetEmail,
        toName: 'Examination Controller',
        notes: `Pending review for ${paper.subjectCode} (${paper.academicTerm}).`,
      });

      await updateDoc(doc(db, 'questionPapers', paper.id), {
        lastReminderSentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setBannerMsg(
        `Reminder processed for "${paper.title}" (${result.deliveryStatus === 'sent_smtp' ? 'sent via SMTP' : 'logged in email audit trail'}).`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `questionPapers/${paper.id}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleRunPendingBatch = async () => {
    if (pendingPapers.length === 0) return;
    setProcessing(true);
    setBannerMsg(null);
    try {
      for (const p of pendingPapers) {
        await dispatchEmailAndLog({
          paper: p,
          triggerType: 'reminder_overdue',
          toEmail: recipientEmail.trim() || currentUser.email,
          toName: 'Examination Controller',
          notes: `Automated pending review cycle sweep (threshold: ${thresholdDays} day(s)).`,
        });
        await updateDoc(doc(db, 'questionPapers', p.id), {
          lastReminderSentAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setBannerMsg(
        `Dispatched automated review reminders for ${pendingPapers.length} pending paper(s).`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'reviewNotifications');
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveReminderSettings = async () => {
    if (effectiveRole !== 'exam_controller') return;
    setProcessing(true);
    setBannerMsg(null);
    try {
      await setDoc(doc(db, 'notificationSettings', 'global'), {
        autoRemindEnabled,
        pendingThresholdDays: Math.min(Math.max(Number(thresholdDays) || 2, 1), 30),
        controllerEmail: recipientEmail.trim() || currentUser.email,
        updatedBy: currentUser.uid,
        updatedAt: serverTimestamp(),
      });
      setBannerMsg('Automated pending-review notification schedule saved.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'notificationSettings/global');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900">
            Review Cycles &amp; Email Reminders
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Track paper approval status, issue Exam Controller sign-off, and automate pending review email notifications.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(['ALL', 'pending_review', 'changes_requested', 'approved', 'published', 'draft'] as const).map(
            (st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'ALL' ? 'All Papers' : STATUS_LABELS[st]}
              </button>
            )
          )}
        </div>
      </div>

      {bannerMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          {bannerMsg}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Papers Queue */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Submitted &amp; Draft Papers ({filteredPapers.length})
            </h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {pendingPapers.length} pending
            </span>
          </div>

          {filteredPapers.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No question papers match this status filter.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredPapers.map((p) => {
                const isSelected = selectedPaper?.id === p.id;
                const statusColor =
                  p.status === 'approved' || p.status === 'published'
                    ? 'text-emerald-700'
                    : p.status === 'pending_review'
                    ? 'text-amber-700'
                    : p.status === 'changes_requested'
                    ? 'text-red-700'
                    : 'text-slate-600';

                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPaperId(p.id)}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-slate-100/80' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{p.title}</p>
                      <span className={`text-xs font-medium whitespace-nowrap ${statusColor}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 tabular-nums">
                      {p.subjectCode} · {p.academicTerm} · {p.totalMarks} Marks · By {p.createdByName}
                    </p>
                    {p.status === 'pending_review' && (
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">
                          {p.lastReminderSentAt
                            ? `Reminder sent ${p.lastReminderSentAt.toDate().toLocaleDateString()}`
                            : 'Awaiting Exam Controller action'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendPendingReminder(p);
                          }}
                          disabled={processing}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                        >
                          <Mail className="w-3 h-3" />
                          Send Reminder
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Selected Paper Review Detail */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          {!selectedPaper ? (
            <div className="p-12 text-center text-xs text-slate-500">
              Select a question paper on the left to inspect questions, export, or record review decisions.
            </div>
          ) : (
            <div className="p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {selectedPaper.subjectCode} · {selectedPaper.subjectName} ·{' '}
                    {selectedPaper.academicTerm}
                  </p>
                  <h3 className="font-display text-lg font-bold text-slate-900 mt-0.5">
                    {selectedPaper.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 tabular-nums">
                    Status: <strong className="text-slate-900">{STATUS_LABELS[selectedPaper.status]}</strong> ·{' '}
                    {selectedPaper.totalMarks} Marks · {selectedPaper.durationMinutes} mins
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(selectedPaper.status !== 'published' ||
                    effectiveRole === 'exam_controller') && (
                    <button
                      type="button"
                      onClick={() => onEditPaper(selectedPaper.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit / Override
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      exportPaperToDocx({
                        title: selectedPaper.title,
                        subjectCode: selectedPaper.subjectCode,
                        subjectName: selectedPaper.subjectName,
                        examType: selectedPaper.examType,
                        academicTerm: selectedPaper.academicTerm,
                        durationMinutes: selectedPaper.durationMinutes,
                        totalMarks: selectedPaper.totalMarks,
                        instructions: selectedPaper.instructions,
                        sections: selectedPaper.sections,
                        includeAnswerKey: true,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    .docx
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      exportPaperToPdf({
                        title: selectedPaper.title,
                        subjectCode: selectedPaper.subjectCode,
                        subjectName: selectedPaper.subjectName,
                        examType: selectedPaper.examType,
                        academicTerm: selectedPaper.academicTerm,
                        durationMinutes: selectedPaper.durationMinutes,
                        totalMarks: selectedPaper.totalMarks,
                        instructions: selectedPaper.instructions,
                        sections: selectedPaper.sections,
                        includeAnswerKey: true,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    PDF
                  </button>
                </div>
              </div>

              {/* Bloom Summary */}
              {(() => {
                const audit = auditPaperBlooms(selectedPaper.sections);
                return (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2 tabular-nums">
                    <span>
                      Bloom Balance: L2 {audit.percentages[2]}% · L3 {audit.percentages[3]}% · L4{' '}
                      {audit.percentages[4]}%
                    </span>
                    <span>
                      Verbs ({audit.uniqueVerbs.length}): {audit.uniqueVerbs.slice(0, 6).join(', ')}
                      {audit.uniqueVerbs.length > 6 ? '...' : ''}
                    </span>
                  </div>
                );
              })()}

              {/* Questions Preview */}
              <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
                {selectedPaper.sections.map((sec) => (
                  <div key={sec.id} className="space-y-2">
                    <p className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1">
                      {sec.title} — {sec.description}
                    </p>
                    <div className="divide-y divide-slate-100">
                      {sec.questions.map((slot, idx) => (
                        <div key={slot.slotId} className="py-2 text-xs">
                          <div className="flex justify-between gap-3">
                            <p className="text-slate-900">
                              <strong className="font-mono">Q{idx + 1}.</strong> {slot.text}
                            </p>
                            <span className="font-mono font-semibold text-slate-700 shrink-0 tabular-nums">
                              [{slot.marks} M]
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {slot.topic} · {getBloomLabel(slot.bloomLevel)} · Verb: {slot.actionVerb}
                            {slot.isManualOverride ? ' · Manual Override' : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Exam Controller Sign-off Controls */}
              {effectiveRole === 'exam_controller' ? (
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <label className="block text-xs font-medium text-slate-700">
                    Exam Controller Review Notes
                  </label>
                  <textarea
                    rows={2}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Add feedback on Bloom's distribution, difficulty balance, or approve for printing..."
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleReviewDecision('changes_requested')}
                      disabled={processing}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Request Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewDecision('approved')}
                      disabled={processing}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Approve Paper
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewDecision('published')}
                      disabled={processing}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Publish &amp; Lock
                    </button>
                  </div>
                </div>
              ) : (
                selectedPaper.reviewNotes && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
                    <span className="font-semibold text-slate-900">Reviewer Feedback: </span>
                    {selectedPaper.reviewNotes}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Automated Pending Review Email Engine & Dispatch Log */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-slate-800" />
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Automated Pending Review Email Engine
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Automatically dispatches reminder emails when submitted question papers remain pending beyond the configured threshold.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Review Notification Recipient Email
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 items-center">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pending Threshold (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={thresholdDays}
                  onChange={(e) => setThresholdDays(Number(e.target.value))}
                  disabled={effectiveRole !== 'exam_controller'}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg tabular-nums"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 pt-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRemindEnabled}
                  onChange={(e) => setAutoRemindEnabled(e.target.checked)}
                  disabled={effectiveRole !== 'exam_controller'}
                  className="rounded border-slate-300"
                />
                Auto-remind enabled
              </label>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {effectiveRole === 'exam_controller' && (
                <button
                  type="button"
                  onClick={handleSaveReminderSettings}
                  disabled={processing}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  Save Schedule Settings
                </button>
              )}
              <button
                type="button"
                onClick={handleRunPendingBatch}
                disabled={processing || pendingPapers.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5" />
                Run Pending Review Check ({pendingPapers.length})
              </button>
            </div>
          </div>
        </div>

        {/* Email Dispatch Audit Log */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Email Notification Dispatch Log
            </h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {notifications.length} sent/logged
            </span>
          </div>

          {notifications.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No review emails have been dispatched yet. Submit a paper or click &ldquo;Run Pending Review Check&rdquo;.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 max-h-[340px] overflow-y-auto">
              {notifications.map((n) => {
                const isExpanded = expandedNotifId === n.id;
                return (
                  <div key={n.id} className="p-4 text-xs space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{n.emailSubject}</p>
                        <p className="text-slate-500 mt-0.5">
                          To: {n.recipientName} ({n.recipientEmail}) · {n.subjectCode} ·{' '}
                          {n.deliveryStatus === 'sent_smtp'
                            ? 'Delivered via SMTP'
                            : 'Queued / Audit Logged'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedNotifId(isExpanded ? null : n.id)}
                        className="text-slate-700 underline whitespace-nowrap cursor-pointer"
                      >
                        {isExpanded ? 'Hide Body' : 'Preview'}
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                        <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 leading-relaxed">
                          {n.emailBody}
                        </pre>
                        {n.deliveryNote && (
                          <p className="text-[11px] text-slate-500">{n.deliveryNote}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
