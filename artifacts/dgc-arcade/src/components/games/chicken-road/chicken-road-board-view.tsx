import { StakeChickenBoard } from "./stake-chicken-board";
import type { CrossAnim, HazardType } from "./stake-chicken-board";

export type { CrossAnim, HazardType };

interface ChickenRoadBoardProps {
  lanes: number;
  currentLane: number;
  status: "idle" | "active" | "won" | "lost";
  multipliers: number[];
  hopping: boolean;
  chickenVisible: boolean;
  bustLane?: number;
  bustHazard?: HazardType;
  crossAnim: CrossAnim;
  previewMode?: boolean;
  onCrossNext?: () => void;
  canCross?: boolean;
  crossLoading?: boolean;
}

/**
 * Renders the Stake-style DOM board. Pixi was retired here — it could init with a
 * zero-height flex parent and show a blank dark canvas on desktop/web.
 */
export function ChickenRoadBoard(props: ChickenRoadBoardProps) {
  return (
    <StakeChickenBoard
      lanes={props.lanes}
      currentLane={props.currentLane}
      status={props.status}
      multipliers={props.multipliers}
      hopping={props.hopping}
      chickenVisible={props.chickenVisible || props.status === "idle"}
      bustLane={props.bustLane}
      bustHazard={props.bustHazard}
      crossAnim={props.crossAnim}
      onCrossNext={props.onCrossNext}
      canCross={props.canCross}
      crossLoading={props.crossLoading}
    />
  );
}
