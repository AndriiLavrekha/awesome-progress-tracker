export type ProjectStatus =
  | "idea"
  | "active"
  | "blocked"
  | "paused"
  | "done"
  | "deployed"
  | "archived";

export type Sensitivity = "normal" | "private" | "sensitive";

export interface ProjectSummary {
  progressPath: string;
  project: string;
  status: ProjectStatus;
  path: string;
  updated: string;
  lastMilestone: string;
  deployed: boolean;
  deploymentUrl: string;
  sensitivity: Sensitivity;
  commitProgress: boolean;
  resumeSnapshot: string;
  nextAction: string;
  blockers: string;
}
