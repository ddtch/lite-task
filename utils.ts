import { createDefine } from "fresh";
import type { Project } from "./db/queries.ts";

export interface State {
  projects: Project[];
}

export const define = createDefine<State>();
