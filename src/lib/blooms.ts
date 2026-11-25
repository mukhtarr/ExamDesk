import type {
  BloomLevel,
  Difficulty,
  PaperQuestionSlot,
  PaperSection,
  Question,
  TemplateSectionConfig,
} from '../types';

export interface BloomLevelInfo {
  level: BloomLevel;
  label: string;
  shortLabel: string;
  description: string;
  verbs: string[];
}

export const BLOOM_LEVELS: Record<BloomLevel, BloomLevelInfo> = {
  2: {
    level: 2,
    label: 'Level 2: Understand',
    shortLabel: 'L2 Understand',
    description: 'Construct meaning, explain mechanisms, classify concepts, and compare principles.',
    verbs: [
      'Explain',
      'Summarize',
      'Classify',
      'Illustrate',
      'Compare',
      'Interpret',
      'Paraphrase',
      'Distinguish',
      'Infer',
    ],
  },
  3: {
    level: 3,
    label: 'Level 3: Apply',
    shortLabel: 'L3 Apply',
    description: 'Execute procedures, solve quantitative problems, and implement algorithms in new contexts.',
    verbs: [
      'Apply',
      'Solve',
      'Implement',
      'Demonstrate',
      'Calculate',
      'Construct',
      'Execute',
      'Sketch',
      'Use',
    ],
  },
  4: {
    level: 4,
    label: 'Level 4: Analyze',
    shortLabel: 'L4 Analyze',
    description: 'Break material into constituent parts, examine trade-offs, and deduce causal structures.',
    verbs: [
      'Analyze',
      'Differentiate',
      'Examine',
      'Deconstruct',
      'Contrast',
      'Investigate',
      'Categorize',
      'Deduce',
      'Critique',
    ],
  },
};

export function getBloomLabel(level: number): string {
  if (level === 2) return 'L2 · Understand';
  if (level === 3) return 'L3 · Apply';
  if (level === 4) return 'L4 · Analyze';
  return `L${level}`;
}

export function auditPaperBlooms(sections: PaperSection[]) {
  const allSlots = sections.flatMap((s) => s.questions);
  const total = allSlots.length;
  const counts: Record<BloomLevel, number> = { 2: 0, 3: 0, 4: 0 };
  const verbFrequency: Record<string, number> = {};
  let overrideCount = 0;

  for (const slot of allSlots) {
    if (slot.bloomLevel === 2 || slot.bloomLevel === 3 || slot.bloomLevel === 4) {
      counts[slot.bloomLevel] += 1;
    }
    const verb = (slot.actionVerb || '').trim();
    if (verb) {
      const normalized = verb.charAt(0).toUpperCase() + verb.slice(1).toLowerCase();
      verbFrequency[normalized] = (verbFrequency[normalized] || 0) + 1;
    }
    if (slot.isManualOverride) {
      overrideCount += 1;
    }
  }

  const uniqueVerbs = Object.keys(verbFrequency).sort();
  const totalMarks = sections.reduce(
    (sum, sec) => sum + sec.compulsoryCount * sec.marksPerQuestion,
    0
  );

  return {
    totalQuestions: total,
    counts,
    percentages: {
      2: total > 0 ? Math.round((counts[2] / total) * 100) : 0,
      3: total > 0 ? Math.round((counts[3] / total) * 100) : 0,
      4: total > 0 ? Math.round((counts[4] / total) * 100) : 0,
    },
    uniqueVerbs,
    verbFrequency,
    overrideCount,
    totalMarks,
  };
}

export interface AssemblyFilters {
  topicFilter: string;
  difficultyOverride: Difficulty | 'TemplateDefault';
  bloomFocus: BloomLevel | 'Balanced';
}

export function assemblePaperSections(
  sectionConfigs: TemplateSectionConfig[],
  subjectQuestions: Question[],
  filters: AssemblyFilters
): { sections: PaperSection[]; warnings: string[] } {
  const usedQuestionIds = new Set<string>();
  const usedVerbsCount = new Map<string, number>();
  const usedBloomCounts: Record<BloomLevel, number> = { 2: 0, 3: 0, 4: 0 };
  const warnings: string[] = [];

  const sections: PaperSection[] = sectionConfigs.map((cfg) => {
    const slots: PaperQuestionSlot[] = [];

    for (let i = 0; i < cfg.questionCount; i++) {
      const targetDifficulty =
        filters.difficultyOverride !== 'TemplateDefault'
          ? filters.difficultyOverride
          : cfg.preferredDifficulty;

      const candidates = subjectQuestions.filter((q) => {
        if (usedQuestionIds.has(q.id)) return false;
        if (q.marks !== cfg.marksPerQuestion) return false;
        if (filters.topicFilter !== 'ALL' && q.topic !== filters.topicFilter) return false;
        return true;
      });

      // Fallback if strict marks/topic yields fewer than needed: relax topic first, then marks
      let pool = candidates;
      if (pool.length === 0) {
        pool = subjectQuestions.filter(
          (q) => !usedQuestionIds.has(q.id) && q.marks === cfg.marksPerQuestion
        );
        if (pool.length > 0 && filters.topicFilter !== 'ALL') {
          warnings.push(
            `${cfg.title} Q${i + 1}: Broadened topic beyond "${filters.topicFilter}" to match ${cfg.marksPerQuestion} marks.`
          );
        }
      }
      if (pool.length === 0) {
        pool = subjectQuestions.filter((q) => !usedQuestionIds.has(q.id));
        if (pool.length > 0) {
          warnings.push(
            `${cfg.title} Q${i + 1}: No unused ${cfg.marksPerQuestion}-mark question available; substituted closest bank question.`
          );
        }
      }

      if (pool.length === 0) {
        warnings.push(
          `${cfg.title} Q${i + 1}: Insufficient questions in bank. Use Override or Generate from Syllabus to fill.`
        );
        continue;
      }

      // Score candidates to optimize:
      // 1) Difficulty match
      // 2) Bloom's L2/L3/L4 coverage & section allowed blooms
      // 3) Action verb diversity (penalize already used verbs)
      // 4) Balanced usage (prefer less overused questions)
      const scored = pool.map((q) => {
        let score = 0;
        if (targetDifficulty === 'Mixed' || q.difficulty === targetDifficulty) {
          score += 30;
        }
        if (cfg.allowedBloomLevels.includes(q.bloomLevel)) {
          score += 25;
        }
        if (filters.bloomFocus !== 'Balanced' && q.bloomLevel === filters.bloomFocus) {
          score += 20;
        } else {
          // Encourage L2, L3, L4 balance
          const minBloomCount = Math.min(usedBloomCounts[2], usedBloomCounts[3], usedBloomCounts[4]);
          if (usedBloomCounts[q.bloomLevel] === minBloomCount) {
            score += 18;
          }
        }
        const verbKey = q.actionVerb.trim().toLowerCase();
        const verbUsed = usedVerbsCount.get(verbKey) || 0;
        score -= verbUsed * 14;
        score -= Math.min(q.usageCount, 10) * 1.2;

        return { q, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const chosen = scored[0].q;

      usedQuestionIds.add(chosen.id);
      const verbKey = chosen.actionVerb.trim().toLowerCase();
      usedVerbsCount.set(verbKey, (usedVerbsCount.get(verbKey) || 0) + 1);
      usedBloomCounts[chosen.bloomLevel] += 1;

      slots.push({
        slotId: `${cfg.id}-q-${i + 1}-${Date.now()}`,
        questionId: chosen.id,
        text: chosen.text,
        topic: chosen.topic,
        difficulty: chosen.difficulty,
        marks: cfg.marksPerQuestion,
        bloomLevel: chosen.bloomLevel,
        actionVerb: chosen.actionVerb,
        expectedAnswer: chosen.expectedAnswer,
        isManualOverride: false,
      });
    }

    return {
      id: cfg.id,
      title: cfg.title,
      description: cfg.description,
      marksPerQuestion: cfg.marksPerQuestion,
      compulsoryCount: cfg.compulsoryCount,
      questions: slots,
    };
  });

  return { sections, warnings };
}
