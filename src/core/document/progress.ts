import type { Stage } from "./stages.ts";

const BAR_WIDTH = 10;

const doneCount = (stages: readonly Stage[]): number => stages.filter((s) => s.done).length;

export const stageProgress = (stages: readonly Stage[]): string | undefined =>
  stages.length > 0 ? `${doneCount(stages)}/${stages.length}` : undefined;

export const nextStage = (stages: readonly Stage[]): string | undefined =>
  stages.find((stage) => !stage.done)?.title;

/** `3/5 ▰▰▰▱▱`: one mark per stage, scaled down to ten for long plans. */
export const progressBar = (stages: readonly Stage[]): string | undefined => {
  const progress = stageProgress(stages);
  if (!progress) return undefined;
  const width = Math.min(stages.length, BAR_WIDTH);
  const filled = Math.round((doneCount(stages) / stages.length) * width);
  return `${progress} ${"▰".repeat(filled)}${"▱".repeat(width - filled)}`;
};
