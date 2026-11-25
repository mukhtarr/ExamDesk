/**
 * Security Rule Verification Suite for ExamDesk
 * Verifies the "Dirty Dozen" adversarial payloads against firestore.rules.
 * Run with Firebase Emulator Suite when testing locally.
 */

export interface AdversarialTestCase {
  id: string;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  payload?: Record<string, unknown>;
}

export const DIRTY_DOZEN_CASES: AdversarialTestCase[] = [
  {
    id: 'DD-01',
    name: 'Privilege escalation on user profile creation',
    collection: 'users',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { uid: 'user-2', role: 'exam_controller', email: 'attacker@example.com' },
  },
  {
    id: 'DD-02',
    name: 'Ghost field injection on question update',
    collection: 'questions',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { isVerified: true },
  },
  {
    id: 'DD-03',
    name: 'Unverified email spoof on admin settings',
    collection: 'notificationSettings',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { autoRemindEnabled: false, pendingThresholdDays: 5 },
  },
  {
    id: 'DD-04',
    name: 'Cross-user PII read on users collection',
    collection: 'users',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-05',
    name: 'Unscoped list query on reviewNotifications',
    collection: 'reviewNotifications',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06',
    name: 'Identity spoofing via createdBy on question create',
    collection: 'questions',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { createdBy: 'victim-uid' },
  },
  {
    id: 'DD-07',
    name: 'State shortcutting paper directly to approved on create',
    collection: 'questionPapers',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { status: 'approved' },
  },
  {
    id: 'DD-08',
    name: 'Subject owner approving own paper',
    collection: 'questionPapers',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { status: 'approved' },
  },
  {
    id: 'DD-09',
    name: 'Modifying terminal published question paper as non-controller',
    collection: 'questionPapers',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { title: 'Tampered Title' },
  },
  {
    id: 'DD-10',
    name: 'Path ID poisoning with invalid characters',
    collection: 'questions',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-11',
    name: 'Client-forged createdAt timestamp',
    collection: 'questions',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
  },
  {
    id: 'DD-12',
    name: 'Out-of-bounds Bloom taxonomy level',
    collection: 'questions',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { bloomLevel: 1 },
  },
];
