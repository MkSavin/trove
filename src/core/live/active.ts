import { TroveError } from "../errors.ts";

const SPAN = /^(\d+)([dwm])$/;
const UNITS = { d: "days", w: "weeks", m: "months" } as const;

const isUnit = (unit: string): unit is keyof typeof UNITS => Object.hasOwn(UNITS, unit);

/** The earliest date that still counts as active for a span such as `30d`, `6w` or `3m`. */
export const activeFrom = (span: string, today: string): string => {
  const match = SPAN.exec(span);
  const unit = match?.[2] ?? "";
  if (!match || !isUnit(unit))
    throw new TroveError(`active=${span}: give days, weeks or months, e.g. 30d, 6w or 3m`);
  return Temporal.PlainDate.from(today)
    .subtract({ [UNITS[unit]]: Number(match[1]) })
    .toString();
};
