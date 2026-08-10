import { createFlowExit, type FlowHistory } from "#/lib/navigation/flow-exit";

export type PoolCreateHistory = FlowHistory;

const poolCreateExit = createFlowExit({ reentrant: true });

export const beginPoolCreateHistory = poolCreateExit.noteRoot;
export const resetPoolCreateHistory = poolCreateExit.reset;
export const exitPoolCreateHistory = poolCreateExit.exit;
