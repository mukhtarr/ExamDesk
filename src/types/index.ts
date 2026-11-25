import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'exam_controller' | 'subject_owner';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type BloomLevel = 2 | 3 | 4;
export type QuestionSource = 'bank' | 'ai_syllabus' | 'manual';
export type PaperStatus = 'draft' | 'pending_review' | 'changes_requested' | 'approved' | 'published';

export interface UserProfile {
  id?: string;
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  department: string;
  assignedSubjects: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  department: string;
  ownerId: string;
  ownerName: string;
  topics: string[];
  syllabusText: string;
  workspaceScope: 'institutional';
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Question {
  id: string;
  subjectId: string;
  subjectCode: string;
  topic: string;
  text: string;
  difficulty: Difficulty;
  marks: number;
  bloomLevel: BloomLevel;
  actionVerb: string;
  expectedAnswer: string;
  source: QuestionSource;
  usageCount: number;
  overrideCount: number;
  workspaceScope: 'institutional';
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface TemplateSectionConfig {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  marksPerQuestion: number;
  compulsoryCount: number;
  preferredDifficulty: Difficulty | 'Mixed';
  allowedBloomLevels: BloomLevel[];
}

export interface PaperTemplate {
  id: string;
  name: string;
  description: string;
  totalMarks: number;
  durationMinutes: number;
  instructions: string[];
  sections: TemplateSectionConfig[];
  workspaceScope: 'institutional';
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PaperQuestionSlot {
  slotId: string;
  questionId: string;
  text: string;
  topic: string;
  difficulty: Difficulty;
  marks: number;
  bloomLevel: BloomLevel;
  actionVerb: string;
  expectedAnswer?: string;
  isManualOverride: boolean;
  originalQuestionId?: string;
}

export interface PaperSection {
  id: string;
  title: string;
  description: string;
  marksPerQuestion: number;
  compulsoryCount: number;
  questions: PaperQuestionSlot[];
}

export interface QuestionPaper {
  id: string;
  title: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  examType: string;
  academicTerm: string;
  durationMinutes: number;
  totalMarks: number;
  instructions: string[];
  sections: PaperSection[];
  status: PaperStatus;
  reviewNotes: string;
  reviewerName: string;
  workspaceScope: 'institutional';
  createdBy: string;
  createdByName: string;
  submittedForReviewAt?: Timestamp;
  lastReminderSentAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface TopicMasteryEntry {
  topic: string;
  avgPercent: number;
}

export interface StudentAssessment {
  id: string;
  subjectId: string;
  subjectCode: string;
  paperId: string;
  paperTitle: string;
  cohort: string;
  examDate: string;
  studentCount: number;
  averageScore: number;
  passRate: number;
  bloomAttainment: {
    l2: number;
    l3: number;
    l4: number;
  };
  topicMastery: TopicMasteryEntry[];
  workspaceScope: 'institutional';
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ReviewNotification {
  id: string;
  paperId: string;
  paperTitle: string;
  subjectCode: string;
  recipientUid: string;
  recipientName: string;
  recipientEmail: string;
  triggerType: 'submission' | 'reminder_overdue' | 'changes_requested' | 'approved';
  emailSubject: string;
  emailBody: string;
  deliveryStatus: 'sent_smtp' | 'queued_preview' | 'failed';
  deliveryNote: string;
  sentBy: string;
  createdAt?: Timestamp;
}

export interface NotificationSetting {
  id?: string;
  autoRemindEnabled: boolean;
  pendingThresholdDays: number;
  controllerEmail: string;
  updatedBy: string;
  updatedAt?: Timestamp;
}

export interface MarkBucketRequest {
  id: string;
  count: number;
  marks: number;
  difficulty: Difficulty | 'Mixed';
  topic: string;
}
