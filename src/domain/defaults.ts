import { addD, fmtDate, today } from "./dates";
import type { ProjectData } from "./types";

export const defaultData = (): ProjectData => ({
  project: { name: "My Project", startDate: fmtDate(today()), targetReleaseDate: fmtDate(addD(today(), 30)), teamMembers: [], holidays: [] },
  milestones: [],
  tasks: [],
  baselines: [],
});
