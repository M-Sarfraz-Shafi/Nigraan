export interface Interval {
  start: string;
  end: string;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/**
 * Assigns each item a lane index (0-based) so that items in the same lane
 * never overlap, using as few lanes as possible. Order of the returned
 * array matches the input order (not sorted order).
 */
export function packLanes<T extends Interval>(items: T[]): number[] {
  const indexed = items.map((it, i) => ({ start: it.start, end: it.end, i }));
  const sorted = [...indexed].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const laneEnds: string[] = [];
  const lanes = new Array(items.length).fill(0);
  sorted.forEach((it) => {
    let lane = laneEnds.findIndex((end) => end < it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else {
      laneEnds[lane] = it.end;
    }
    lanes[it.i] = lane;
  });
  return lanes;
}

/** For each item, whether it overlaps at least one other item in the list. */
export function hasOverlapWithOthers<T extends Interval>(items: T[]): boolean[] {
  return items.map((item, i) => items.some((other, j) => j !== i && overlaps(item, other)));
}
