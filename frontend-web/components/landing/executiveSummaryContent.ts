import executiveSummaryEn from '@/locales/executiveSummary.en.json';
import executiveSummaryEs from '@/locales/executiveSummary.es.json';

import type { ExecLocale } from './investorCopy';

export type ExecutiveImageKey = keyof typeof executiveSummaryEs.imageHints;

export type TierRow = { name: string; detail: string };

export type StrategicFlow = {
  queEs: string;
  comoFunciona: string;
  valorEstrategico: string[];
  modeloIngreso: string;
};

export type Section =
  | {
      kind: 'narrative';
      num: number;
      eyebrow: string;
      title: string;
      bullets: string[];
      image?: ExecutiveImageKey;
    }
  | {
      kind: 'segments';
      num: number;
      eyebrow: string;
      title: string;
      bullets: string[];
      establishedExamples: Array<{ sector: string; text: string }>;
    }
  | {
      kind: 'tiers';
      num: number;
      eyebrow: string;
      title: string;
      tiers: TierRow[];
    }
  | {
      kind: 'simpleLists';
      num: number;
      eyebrow: string;
      title: string;
      groups: Array<{ subtitle: string; items: string[] }>;
      image?: ExecutiveImageKey;
    }
  | {
      kind: 'strategicFlows';
      num: number;
      eyebrow: string;
      title: string;
      flows: StrategicFlow[];
      imageBetween?: ExecutiveImageKey;
    };

export type StrategicBlock = {
  num: number;
  eyebrow: string;
  title: string;
  queEs: string;
  comoFunciona: string;
  valorBullets: string[];
  modeloIngreso: string;
  image?: ExecutiveImageKey;
};

export type ExecutiveSummaryBundle = {
  sections: Section[];
  strategicBlocks: StrategicBlock[];
  imageHints: Record<ExecutiveImageKey, { filename: string; caption: string }>;
};

export function getExecutiveSummaryBundle(locale: ExecLocale): ExecutiveSummaryBundle {
  const raw = locale === 'es' ? executiveSummaryEs : executiveSummaryEn;
  return {
    sections: raw.sections as Section[],
    strategicBlocks: raw.strategicBlocks as StrategicBlock[],
    imageHints: raw.imageHints as ExecutiveSummaryBundle['imageHints'],
  };
}
