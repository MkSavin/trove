const ISO_DATE = /^\d{4}-\d\d-\d\d$/;

export const isIsoDate = (value: string): boolean => {
  if (!ISO_DATE.test(value)) return false;
  try {
    Temporal.PlainDate.from(value, { overflow: "reject" });
    return true;
  } catch {
    return false;
  }
};

export const today = (): string => Temporal.Now.plainDateISO().toString();

export const daysBetween = (from: string, to: string): number =>
  Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(to)).days;
