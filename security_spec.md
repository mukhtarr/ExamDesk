# Security Specification & Payload-First TDD

## 1. Data Invariants
1. **Identity Integrity**: Every created `User` document must have `uid == request.auth.uid`. Non-controllers cannot self-assign `role: 'exam_controller'`.
2. **PII Isolation**: `users/{userId}` and `reviewNotifications/{notificationId}` contain email addresses and are strictly readable only by the owner/recipient, sender, or an Exam Controller. Shared academic collections (`subjects`, `questions`, `paperTemplates`, `questionPapers`, `studentAssessments`) exclude email PII.
3. **Bloom's Taxonomy Invariant**: Every `Question` must enforce `bloomLevel in [2, 3, 4]`, valid `difficulty in ['Easy', 'Medium', 'Hard']`, and bounded `marks` (`1..50`).
4. **Paper Lifecycle & Terminal Lock**: A newly created `QuestionPaper` must begin in `status: 'draft'`. Only an `exam_controller` may transition a paper to `'approved'`, `'changes_requested'`, or `'published'`. Once `'published'`, non-controllers cannot modify it.
5. **Temporal & Relational Integrity**: `createdAt` and `updatedAt` must equal `request.time`. `createdBy` and `createdAt` are immutable after creation. Questions and Question Papers require valid existing `subjectId` references.
6. **Path & Size Bounds**: Every document ID matches `^[a-zA-Z0-9_\-]+$` (max 128 chars). Every string and list has explicit `.size()` upper bounds.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Privilege Escalation on Signup**: Non-controller creates `/users/{uid}` with `role: 'exam_controller'`. -> Expected: `PERMISSION_DENIED`.
2. **Ghost Field Injection (Shadow Update)**: Staff updates a `Question` adding `{ isVerified: true }`. -> Expected: `PERMISSION_DENIED`.
3. **Unverified Email Spoof**: Caller with `email == 'mukhtar.amir44@gmail.com'` and `email_verified: false` writes to `/notificationSettings/global`. -> Expected: `PERMISSION_DENIED`.
4. **PII Cross-Read**: Subject Owner attempts `get` on another user's `/users/{otherUid}` document. -> Expected: `PERMISSION_DENIED`.
5. **Blanket Unscoped List**: Caller attempts `list` on `/reviewNotifications` without matching `recipientUid` or `sentBy`. -> Expected: `PERMISSION_DENIED`.
6. **Identity Spoofing on Question Create**: User creates `/questions/{id}` with `createdBy: 'other_uid'`. -> Expected: `PERMISSION_DENIED`.
7. **State Shortcutting on Paper Create**: Subject Owner creates `/questionPapers/{id}` directly with `status: 'approved'`. -> Expected: `PERMISSION_DENIED`.
8. **Unauthorized Approval**: Subject Owner updates `/questionPapers/{id}` changing `status` from `'pending_review'` to `'approved'`. -> Expected: `PERMISSION_DENIED`.
9. **Terminal State Violation**: Subject Owner updates a `'published'` `/questionPapers/{id}`. -> Expected: `PERMISSION_DENIED`.
10. **ID Poisoning**: Caller attempts to create `/questions/{1500_char_id}` or invalid chars `../admin`. -> Expected: `PERMISSION_DENIED`.
11. **Temporal Forgery**: Caller creates a `Question` with backdated `createdAt: Timestamp(2020-01-01)`. -> Expected: `PERMISSION_DENIED`.
12. **Bloom's Taxonomy Out-of-Bounds**: Caller creates a `Question` with `bloomLevel: 1` or `bloomLevel: 6`. -> Expected: `PERMISSION_DENIED`.
