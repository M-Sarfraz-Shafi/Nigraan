export const uid = (): string => Math.random().toString(36).slice(2, 10);

export const toDate = (s: string | null | undefined): Date | null =>
  s ? new Date(s + "T00:00:00") : null;

export const fmtDate = (d: Date | null): string => {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const daysB = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / 864e5);

export const addD = (d: Date, n: number): Date => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const isWE = (d: Date): boolean => d.getDay() === 0 || d.getDay() === 6;

export const isHol = (d: Date, h?: { date: string }[]): boolean =>
  (h || []).some((x) => x.date === fmtDate(d));

export const isLeave = (d: Date, m?: { leave?: { start: string; end: string }[] } | null): boolean => {
  const ds = fmtDate(d);
  return (m?.leave || []).some((l) => ds >= l.start && ds <= l.end);
};

export const isOff = (
  d: Date,
  h?: { date: string }[],
  m?: { leave?: { start: string; end: string }[] } | null,
): boolean => isWE(d) || isHol(d, h) || (m ? isLeave(d, m) : false);

export const addWD = (
  s: Date | null,
  n: number,
  h?: { date: string }[],
  m?: { leave?: { start: string; end: string }[] } | null,
): Date | null => {
  if (!s || !n || n <= 0) return s;
  let c = new Date(s);
  let k = 0;
  while (k < n - 1) {
    c = addD(c, 1);
    if (!isOff(c, h, m)) k++;
  }
  return c;
};

export const wdBetween = (a: Date | null, b: Date | null, h?: { date: string }[]): number => {
  if (!a || !b) return 0;
  let c = new Date(a);
  let k = 0;
  while (c < b) {
    c = addD(c, 1);
    if (!isWE(c) && !isHol(c, h)) k++;
  }
  return k;
};

export const today = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
