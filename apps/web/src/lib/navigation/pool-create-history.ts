import { createFlowExit } from "#/lib/navigation/flow-exit";

const poolCreateExit = createFlowExit({ reentrant: true });

export const beginPoolCreateHistory = poolCreateExit.noteRoot;
export const resetPoolCreateHistory = poolCreateExit.reset;
export const exitPoolCreateHistory = poolCreateExit.exit;
