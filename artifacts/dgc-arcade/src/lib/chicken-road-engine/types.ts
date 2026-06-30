export type LaneState = "idle" | "past" | "current" | "future" | "bust";
export type HazardType = "car" | "manhole";

export type CrossAnim = {
  lane: number;
  phase: "car-down" | "car-up" | "barrier" | "manhole-fire" | "done";
  carDirection: "down" | "up";
} | null;

export interface ChickenRoadState {
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
}

export const CHICKEN_ROAD_LAYOUT = {
  laneWidth: 80,
  sidewalkWidth: 88,
  boardHeight: 500,
  manholeY: 420,
  chickenY: 412,
} as const;
