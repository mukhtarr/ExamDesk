import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';

export async function seedInitialWorkspaceIfEmpty(uid: string, displayName: string): Promise<boolean> {
  const existingSubjects = await getDocs(
    query(collection(db, 'subjects'), where('workspaceScope', '==', 'institutional'), limit(1))
  );
  if (!existingSubjects.empty) {
    return false;
  }

  const subjects = [
    {
      id: 'subj-cs301',
      code: 'CS-301',
      name: 'Data Structures & Algorithms',
      department: 'Computer Science',
      ownerId: uid,
      ownerName: displayName || 'Dr. Alan Vance',
      topics: ['Asymptotic Complexity', 'Trees & Heaps', 'Graph Algorithms', 'Dynamic Programming', 'Hashing'],
      syllabusText:
        'Unit 1: Asymptotic notation, recurrence relations, Master theorem. Unit 2: Binary search trees, AVL rotations, binary heaps, priority queues. Unit 3: BFS, DFS, Dijkstra shortest path, Bellman-Ford, Kruskal and Prim MST. Unit 4: Optimal substructure, memoization, 0/1 knapsack, longest common subsequence. Unit 5: Hash functions, collision resolution via chaining and open addressing.',
    },
    {
      id: 'subj-ec204',
      code: 'EC-204',
      name: 'Digital Signal Processing',
      department: 'Electronics & Comm.',
      ownerId: uid,
      ownerName: displayName || 'Prof. Meera Krishnan',
      topics: ['Discrete-Time Signals', 'Z-Transform', 'DFT & FFT', 'FIR Filter Design', 'IIR Filter Design'],
      syllabusText:
        'Unit 1: Sampling theorem, aliasing, LTI system convolution and stability. Unit 2: Region of convergence, inverse Z-transform, pole-zero analysis. Unit 3: Discrete Fourier Transform properties, Radix-2 DIT/DIF FFT algorithms. Unit 4: Linear phase FIR design using Hamming/Hanning windows. Unit 5: Bilinear transformation and Butterworth IIR synthesis.',
    },
    {
      id: 'subj-ba402',
      code: 'BA-402',
      name: 'Operations & Supply Chain Strategy',
      department: 'Management Studies',
      ownerId: uid,
      ownerName: displayName || 'Dr. Elena Rostova',
      topics: ['Demand Forecasting', 'Inventory Control', 'Lean Operations', 'Network Design', 'Risk Mitigation'],
      syllabusText:
        'Unit 1: Time-series forecasting, exponential smoothing, forecast error metrics. Unit 2: EOQ models, safety stock under stochastic demand, ABC analysis. Unit 3: Value stream mapping, Kanban pull systems, Six Sigma DMAIC. Unit 4: Facility location optimization and multi-echelon distribution. Unit 5: Dual-sourcing and supply chain resilience.',
    },
  ];

  for (const { id, ...subjectData } of subjects) {
    try {
      await setDoc(doc(db, 'subjects', id), {
        ...subjectData,
        workspaceScope: 'institutional',
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `subjects/${id}`);
    }
  }

  const questionsSeed = [
    // CS-301 Questions (Bloom 2, 3, 4 across 2, 5, 10 marks)
    {
      id: 'q-cs-01',
      subjectId: 'subj-cs301',
      subjectCode: 'CS-301',
      topic: 'Asymptotic Complexity',
      text: 'Explain why amortized O(1) insertion in a dynamic array holds even though occasional resizing takes O(n) time.',
      difficulty: 'Easy',
      marks: 2,
      bloomLevel: 2,
      actionVerb: 'Explain',
      expectedAnswer: 'Show potential or accounting method: doubling capacity spreads n copy operations across n/2 insertions, yielding constant amortized cost.',
      usageCount: 6,
      overrideCount: 0,
    },
    {
      id: 'q-cs-02',
      subjectId: 'subj-cs301',
      subjectCode: 'CS-301',
      topic: 'Trees & Heaps',
      text: 'Compare AVL trees and Red-Black trees in terms of height balance strictness and rotation frequency during insertions.',
      difficulty: 'Easy',
      marks: 2,
      bloomLevel: 2,
      actionVerb: 'Compare',
      expectedAnswer: 'AVL maintains stricter balance (height diff <= 1) giving faster lookups; Red-Black allows looser balance (2x black height) needing at most 2 rotations per insert.',
      usageCount: 4,
      overrideCount: 1,
    },
    {
      id: 'q-cs-03',
      subjectId: 'subj-cs301',
      subjectCode: 'CS-301',
      topic: 'Hashing',
      text: 'Illustrate primary clustering in linear probing with a concrete 7-slot hash table example using keys 12, 19, 26, and 5.',
      difficulty: 'Easy',
      marks: 2,
      bloomLevel: 2,
      actionVerb: 'Illustrate',
      expectedAnswer: 'h(k)=k mod 7 places 12->5, 19->5(6), 26->5(0), 5->5(1), forming a contiguous block at slots 5,6,0,1.',
      usageCount: 3,
      overrideCount: 0,
    },
    {
      id: 'q-cs-04',
      subjectId: 'subj-cs301',
      subjectCode: 'CS-301',
      topic: 'Graph Algorithms',
      text: 'Distinguish between edge relaxation conditions in Dijkstra’s algorithm and the Bellman-Ford algorithm.',
      difficulty: 'Easy',
      marks: 2,
      bloomLevel: 2,
      actionVerb: 'Distinguish',
      expectedAnswer: 'Dijkstra greedily finalizes minimum-distance non-negative vertices once; Bellman-Ford relaxes all edges V-1 times supporting negative weights.',
      usageCount: 5,
      overrideCount: 0,
    },
    {
      id: 'q-cs-05',
      subjectId: 'subj-cs301',
      subjectCode: 'CS-301',
      topic: 'Dynamic Programming',
      text: 'Summarize the two structural properties a problem must exhibit for Dynamic Programming to yield an exact optimal solution.',
      difficulty: 'Easy',
      marks: 2,
      bloomLevel: 2,
      actionVerb: 'Summarize',
      expectedAnswer: 'Optimal substructure and overlapping subproblems.',
      usageCount: 2,
      overrideCount: 0,
    },
    {
      id: 'q-cs-06',
      subjectId: 'subj-cs301',
      subjectCode: 'CS-301',
      topic: 'Asymptotic Complexity',
      text: 'Solve the recurrence T(n) = 4T(n/2) + n^2 log n using an appropriate recursion tree or extended Master theorem analysis.',
      difficulty: 'Medium',
      marks: 5,
      bloomLevel: 3,
      actionVerb: 'Solve',
      expectedAnswer: 'Case 2 extended: n^(log_2 4) = n^2, f(n) = Theta(n^2 log^1 n), therefore T(n) = Theta(n^2 log^2 n).',
      usageCount: 8,
      overrideCount: 1,
    },
    {
      id: 'q-cs-07',
      subjectId: 'subj-cs301',
      subjectCode: 'CS-301',
      topic: 'Trees & Heaps',
      text: 'Construct a valid AVL tree by sequentially inserting keys 40, 20, 10, 25, 30, and 22, showing every rotation step.',
      difficulty: 'Medium',
      marks: 5,
      bloomLevel: 3,
      actionVerb: 'Construct',
      expectedAnswer: 'Right rotation at 40 after 10; LR rotation at 20/40 after 30; final balanced tree root 25.',
      usageCount: 7,
      overrideCount: 0,
    },
    {
      id: 'q-cs-08',
      subjectId: 'subj-cs301',
      subjectCode: 'CS-301',
      topic: 'Graph Algorithms',
      text: 'Apply Kruskal’s minimum spanning tree algorithm on a 6-vertex weighted graph and trace the Disjoint Set Union state after each accepted edge.',
      difficulty: 'Medium',
      marks: 5,
      bloomLevel: 3,
      actionVerb: 'Apply',
      expectedAnswer: 'Sort edges ascending, accept lowest weight edges that connect distinct union-find roots until V-1 edges are selected.',
      usageCount: 4,
      overrideCount: 0,
    },
    {
      id: 'q-cs-09',
      subjectId: 'subj-cs301',
      subjectCode: 'CS-301',
      topic: 'Hashing',
      text: 'Demonstrate how double hashing resolves collisions differently from quadratic probing when load factor exceeds 0.7.',
      difficulty: 'Medium',
      marks: 5,
      bloomLevel: 3,
      actionVerb: 'Demonstrate',
      expectedAnswer: 'Double hashing uses h1(k) + i*h2(k) eliminating secondary clustering by giving distinct keys distinct probe sequences.',
      usageCount: 3,
      overrideCount: 2,
    },
    {
      id: 'q-cs-10',
      subjectId: 'subj-cs301',
      subjectCode: 'CS-301',
      topic: 'Dynamic Programming',
      text: 'Analyze why greedy selection by value-to-weight ratio fails for the 0/1 Knapsack problem and construct a counterexample proving optimality failure.',
      difficulty: 'Hard',
      marks: 10,
      bloomLevel: 4,
      actionVerb: 'Analyze',
      expectedAnswer: 'Counterexample: Capacity 50; items (W=10,V=60), (W=20,V=100), (W=30,V=120). Greedy picks 10+20=160; optimal 0/1 picks 20+30=220.',
      usageCount: 9,
      overrideCount: 1,
    },
    {
      id: 'q-cs-11',
      subjectId: 'subj-cs301',
      subjectCode: 'CS-301',
      topic: 'Graph Algorithms',
      text: 'Differentiate between Dijkstra and Bellman-Ford failure modes on graphs containing negative-weight edges versus negative-weight cycles.',
      difficulty: 'Hard',
      marks: 10,
      bloomLevel: 4,
      actionVerb: 'Differentiate',
      expectedAnswer: 'Dijkstra fails silently on negative edges without cycles due to premature greedy finalization; Bellman-Ford handles negative edges and detects negative cycles on Vth pass.',
      usageCount: 5,
      overrideCount: 0,
    },
    {
      id: 'q-cs-12',
      subjectId: 'subj-cs301',
      subjectCode: 'CS-301',
      topic: 'Dynamic Programming',
      text: 'Examine the space-time trade-off between top-down memoization and bottom-up tabulation for Longest Common Subsequence on strings of length m and n.',
      difficulty: 'Hard',
      marks: 10,
      bloomLevel: 4,
      actionVerb: 'Examine',
      expectedAnswer: 'Both O(mn) time; tabulation allows O(min(m,n)) rolling array space optimization and avoids recursion stack overflow, while memoization skips unreachable states.',
      usageCount: 4,
      overrideCount: 0,
    },
    // EC-204 Questions
    {
      id: 'q-ec-01',
      subjectId: 'subj-ec204',
      subjectCode: 'EC-204',
      topic: 'Discrete-Time Signals',
      text: 'Explain the spectral folding phenomenon of aliasing when sampling a 1.8 kHz sinusoid at 2.4 kHz.',
      difficulty: 'Easy',
      marks: 2,
      bloomLevel: 2,
      actionVerb: 'Explain',
      expectedAnswer: 'Sampling below Nyquist (3.6 kHz) folds 1.8 kHz to 2.4 - 1.8 = 0.6 kHz.',
      usageCount: 4,
      overrideCount: 0,
    },
    {
      id: 'q-ec-02',
      subjectId: 'subj-ec204',
      subjectCode: 'EC-204',
      topic: 'Z-Transform',
      text: 'Compare the Region of Convergence properties for causal right-sided signals versus finite-duration sequences.',
      difficulty: 'Easy',
      marks: 2,
      bloomLevel: 2,
      actionVerb: 'Compare',
      expectedAnswer: 'Right-sided ROC extends outside outermost pole |z|>r_max; finite-duration ROC covers entire z-plane except possibly z=0 and z=infinity.',
      usageCount: 3,
      overrideCount: 0,
    },
    {
      id: 'q-ec-03',
      subjectId: 'subj-ec204',
      subjectCode: 'EC-204',
      topic: 'DFT & FFT',
      text: 'Calculate the 4-point DFT of sequence x[n] = {1, 2, 1, 0} using the Radix-2 butterfly structure.',
      difficulty: 'Medium',
      marks: 5,
      bloomLevel: 3,
      actionVerb: 'Calculate',
      expectedAnswer: 'X[k] = {4, -2j, 0, 2j} via two-stage decimation-in-time butterfly.',
      usageCount: 6,
      overrideCount: 1,
    },
    {
      id: 'q-ec-04',
      subjectId: 'subj-ec204',
      subjectCode: 'EC-204',
      topic: 'FIR Filter Design',
      text: 'Apply the Hamming window method to design a 5-tap linear-phase low-pass FIR filter with cutoff frequency pi/3.',
      difficulty: 'Medium',
      marks: 5,
      bloomLevel: 3,
      actionVerb: 'Apply',
      expectedAnswer: 'Compute ideal sinc impulse response h_d[n] centered at n=2 and multiply by Hamming coefficients w[n].',
      usageCount: 5,
      overrideCount: 0,
    },
    {
      id: 'q-ec-05',
      subjectId: 'subj-ec204',
      subjectCode: 'EC-204',
      topic: 'IIR Filter Design',
      text: 'Analyze frequency warping introduced by the Bilinear Transformation and deduce how pre-warping corrects critical band edges.',
      difficulty: 'Hard',
      marks: 10,
      bloomLevel: 4,
      actionVerb: 'Analyze',
      expectedAnswer: 'Non-linear mapping Omega = (2/T) tan(omega/2) compresses high frequencies; pre-warping substitutes desired digital cutoffs prior to analog synthesis.',
      usageCount: 4,
      overrideCount: 0,
    },
    // BA-402 Questions
    {
      id: 'q-ba-01',
      subjectId: 'subj-ba402',
      subjectCode: 'BA-402',
      topic: 'Lean Operations',
      text: 'Contrast push-based MRP scheduling against pull-based Kanban replenishment in variable demand environments.',
      difficulty: 'Hard',
      marks: 10,
      bloomLevel: 4,
      actionVerb: 'Contrast',
      expectedAnswer: 'Push relies on forecast accuracy and increases WIP under demand volatility; Kanban caps WIP strictly via downstream consumption signals.',
      usageCount: 3,
      overrideCount: 0,
    },
    {
      id: 'q-ba-02',
      subjectId: 'subj-ba402',
      subjectCode: 'BA-402',
      topic: 'Inventory Control',
      text: 'Calculate the Economic Order Quantity and reorder point given annual demand 4800 units, setup cost $120, holding cost $4/unit/year, and 5-day lead time.',
      difficulty: 'Medium',
      marks: 5,
      bloomLevel: 3,
      actionVerb: 'Calculate',
      expectedAnswer: 'EOQ = sqrt(2*4800*120/4) = 536.6 -> 537 units; daily demand ~13.15, ROP ~66 units.',
      usageCount: 5,
      overrideCount: 0,
    },
    {
      id: 'q-ba-03',
      subjectId: 'subj-ba402',
      subjectCode: 'BA-402',
      topic: 'Demand Forecasting',
      text: 'Explain how choosing a high smoothing constant (alpha = 0.8) affects exponential smoothing responsiveness versus noise sensitivity.',
      difficulty: 'Easy',
      marks: 2,
      bloomLevel: 2,
      actionVerb: 'Explain',
      expectedAnswer: 'High alpha weights recent observations heavily, reacting quickly to level shifts but amplifying random demand fluctuations.',
      usageCount: 4,
      overrideCount: 0,
    },
  ];

  for (const { id, ...questionData } of questionsSeed) {
    try {
      await setDoc(doc(db, 'questions', id), {
        ...questionData,
        source: 'bank',
        workspaceScope: 'institutional',
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `questions/${id}`);
    }
  }

  const templates = [
    {
      id: 'tpl-endsem-50',
      name: 'Standard End-Semester Format (50 Marks)',
      description: 'Three-tier paper: 5 short conceptual (2M), 4 applied problem-solving (5M), 2 analytical long-form (10M).',
      totalMarks: 50,
      durationMinutes: 150,
      instructions: [
        'All sections are compulsory unless internal choice is indicated.',
        'Illustrate answers with neat diagrams, trace tables, or derivations wherever applicable.',
        'Non-programmable scientific calculators are permitted.',
      ],
      sections: [
        {
          id: 'sec-a',
          title: 'Section A',
          description: 'Short Conceptual Questions (Answer all 5)',
          questionCount: 5,
          marksPerQuestion: 2,
          compulsoryCount: 5,
          preferredDifficulty: 'Easy',
          allowedBloomLevels: [2, 3],
        },
        {
          id: 'sec-b',
          title: 'Section B',
          description: 'Applied Problem Solving (Answer all 4)',
          questionCount: 4,
          marksPerQuestion: 5,
          compulsoryCount: 4,
          preferredDifficulty: 'Medium',
          allowedBloomLevels: [2, 3, 4],
        },
        {
          id: 'sec-c',
          title: 'Section C',
          description: 'Analytical & Comparative Essay (Attempt any 2 of 3)',
          questionCount: 3,
          marksPerQuestion: 10,
          compulsoryCount: 2,
          preferredDifficulty: 'Hard',
          allowedBloomLevels: [3, 4],
        },
      ],
    },
    {
      id: 'tpl-midterm-25',
      name: 'Mid-Term Assessment Blueprint (25 Marks)',
      description: 'Compact 75-minute format mixing L2 conceptual checks with L3/L4 applied analysis.',
      totalMarks: 25,
      durationMinutes: 75,
      instructions: [
        'Attempt all questions in Section A and Section B.',
        'Show intermediate calculation steps clearly.',
      ],
      sections: [
        {
          id: 'sec-a',
          title: 'Section A',
          description: 'Core Concept Checks (Answer all 5)',
          questionCount: 5,
          marksPerQuestion: 2,
          compulsoryCount: 5,
          preferredDifficulty: 'Easy',
          allowedBloomLevels: [2],
        },
        {
          id: 'sec-b',
          title: 'Section B',
          description: 'Applied & Analytical Tasks (Answer all 3)',
          questionCount: 3,
          marksPerQuestion: 5,
          compulsoryCount: 3,
          preferredDifficulty: 'Medium',
          allowedBloomLevels: [3, 4],
        },
      ],
    },
  ];

  for (const { id, ...tplData } of templates) {
    try {
      await setDoc(doc(db, 'paperTemplates', id), {
        ...tplData,
        workspaceScope: 'institutional',
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `paperTemplates/${id}`);
    }
  }

  // Create a sample paper following draft -> pending_review lifecycle rules
  const { updateDoc } = await import('firebase/firestore');
  const pendingPaperDraft = {
    id: 'paper-cs301-autumn26',
    title: 'CS-301 End-Semester Examination Set A',
    subjectId: 'subj-cs301',
    subjectCode: 'CS-301',
    subjectName: 'Data Structures & Algorithms',
    examType: 'End-Semester Examination',
    academicTerm: 'Autumn 2026',
    durationMinutes: 150,
    totalMarks: 50,
    instructions: [
      'All sections are compulsory unless internal choice is indicated.',
      'Illustrate answers with neat diagrams, trace tables, or derivations wherever applicable.',
    ],
    sections: [
      {
        id: 'sec-a',
        title: 'Section A',
        description: 'Short Conceptual Questions (Answer all 5)',
        marksPerQuestion: 2,
        compulsoryCount: 5,
        questions: questionsSeed.slice(0, 5).map((q, idx) => ({
          slotId: `seed-a-${idx + 1}`,
          questionId: q.id,
          text: q.text,
          topic: q.topic,
          difficulty: q.difficulty,
          marks: q.marks,
          bloomLevel: q.bloomLevel,
          actionVerb: q.actionVerb,
          expectedAnswer: q.expectedAnswer,
          isManualOverride: false,
        })),
      },
      {
        id: 'sec-b',
        title: 'Section B',
        description: 'Applied Problem Solving (Answer all 4)',
        marksPerQuestion: 5,
        compulsoryCount: 4,
        questions: questionsSeed.slice(5, 9).map((q, idx) => ({
          slotId: `seed-b-${idx + 1}`,
          questionId: q.id,
          text: q.text,
          topic: q.topic,
          difficulty: q.difficulty,
          marks: q.marks,
          bloomLevel: q.bloomLevel,
          actionVerb: q.actionVerb,
          expectedAnswer: q.expectedAnswer,
          isManualOverride: idx === 3,
        })),
      },
      {
        id: 'sec-c',
        title: 'Section C',
        description: 'Analytical & Comparative Essay (Attempt any 2 of 3)',
        marksPerQuestion: 10,
        compulsoryCount: 2,
        questions: questionsSeed.slice(9, 12).map((q, idx) => ({
          slotId: `seed-c-${idx + 1}`,
          questionId: q.id,
          text: q.text,
          topic: q.topic,
          difficulty: q.difficulty,
          marks: q.marks,
          bloomLevel: q.bloomLevel,
          actionVerb: q.actionVerb,
          expectedAnswer: q.expectedAnswer,
          isManualOverride: false,
        })),
      },
    ],
    status: 'draft',
    reviewNotes: '',
    reviewerName: 'Examination Controller',
    workspaceScope: 'institutional',
    createdBy: uid,
    createdByName: displayName || 'Faculty Coordinator',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const { id: paperDocId, ...paperDraftData } = pendingPaperDraft;
  const paperRef = doc(db, 'questionPapers', paperDocId);
  try {
    await setDoc(paperRef, paperDraftData);
    await updateDoc(paperRef, {
      status: 'pending_review',
      submittedForReviewAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `questionPapers/${paperDocId}`);
  }

  const assessmentsSeed = [
    {
      id: 'assess-cs301-2026a',
      subjectId: 'subj-cs301',
      subjectCode: 'CS-301',
      paperId: 'paper-cs301-autumn26',
      paperTitle: 'CS-301 Mid-Term Evaluation',
      cohort: 'B.Tech CSE Sem V · Batch A',
      examDate: '2026-10-14',
      studentCount: 118,
      averageScore: 74.6,
      passRate: 91.5,
      bloomAttainment: { l2: 86, l3: 74, l4: 63 },
      topicMastery: [
        { topic: 'Asymptotic Complexity', avgPercent: 82 },
        { topic: 'Trees & Heaps', avgPercent: 78 },
        { topic: 'Graph Algorithms', avgPercent: 71 },
        { topic: 'Dynamic Programming', avgPercent: 62 },
        { topic: 'Hashing', avgPercent: 80 },
      ],
    },
    {
      id: 'assess-ec204-2026a',
      subjectId: 'subj-ec204',
      subjectCode: 'EC-204',
      paperId: 'none',
      paperTitle: 'EC-204 Mid-Term Assessment',
      cohort: 'B.Tech ECE Sem IV · Section B',
      examDate: '2026-10-18',
      studentCount: 94,
      averageScore: 69.2,
      passRate: 85.1,
      bloomAttainment: { l2: 81, l3: 68, l4: 58 },
      topicMastery: [
        { topic: 'Discrete-Time Signals', avgPercent: 84 },
        { topic: 'Z-Transform', avgPercent: 72 },
        { topic: 'DFT & FFT', avgPercent: 65 },
        { topic: 'IIR Filter Design', avgPercent: 56 },
      ],
    },
    {
      id: 'assess-ba402-2026a',
      subjectId: 'subj-ba402',
      subjectCode: 'BA-402',
      paperId: 'none',
      paperTitle: 'BA-402 Operations Case Exam',
      cohort: 'MBA Operations · Cohort 2026',
      examDate: '2026-11-02',
      studentCount: 64,
      averageScore: 79.4,
      passRate: 95.3,
      bloomAttainment: { l2: 89, l3: 79, l4: 71 },
      topicMastery: [
        { topic: 'Demand Forecasting', avgPercent: 85 },
        { topic: 'Inventory Control', avgPercent: 77 },
        { topic: 'Lean Operations', avgPercent: 76 },
      ],
    },
  ];

  for (const { id, ...assessmentData } of assessmentsSeed) {
    try {
      await setDoc(doc(db, 'studentAssessments', id), {
        ...assessmentData,
        workspaceScope: 'institutional',
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `studentAssessments/${id}`);
    }
  }

  return true;
}
