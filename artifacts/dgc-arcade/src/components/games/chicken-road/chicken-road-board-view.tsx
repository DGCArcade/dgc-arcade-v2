import { useEffect, useRef, useState } from "react";
import { ChickenRoadRenderer } from "@/lib/chicken-road-engine/ChickenRoadRenderer";
import type { CrossAnim, ChickenRoadState, HazardType } from "@/lib/chicken-road-engine/types";
import { StakeChickenBoard } from "./stake-chicken-board";

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
}

function toEngineState(props: ChickenRoadBoardProps): ChickenRoadState {
  return {
    lanes: props.lanes,
    currentLane: props.currentLane,
    status: props.status,
    multipliers: props.multipliers,
    hopping: props.hopping,
    chickenVisible: props.chickenVisible,
    bustLane: props.bustLane,
    bustHazard: props.bustHazard,
    crossAnim: props.crossAnim,
    previewMode: props.previewMode ?? props.status === "idle",
  };
}

export function ChickenRoadBoard(props: ChickenRoadBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ChickenRoadRenderer | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  const [pixiReady, setPixiReady] = useState(false);

  useEffect(() => {
    if (useFallback) return;
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    const renderer = new ChickenRoadRenderer(el);
    rendererRef.current = renderer;

    const boot = async () => {
      try {
        await renderer.init();
        if (!cancelled) {
          renderer.updateState(toEngineState(props));
          setPixiReady(true);
        }
      } catch (err) {
        console.error("Chicken Road Pixi init failed, using DOM fallback:", err);
        if (!cancelled) setUseFallback(true);
      }
    };

    void boot();

    return () => {
      cancelled = true;
      renderer.destroy();
      rendererRef.current = null;
      setPixiReady(false);
    };
  }, [useFallback]);

  useEffect(() => {
    if (!pixiReady || useFallback) return;
    rendererRef.current?.updateState(toEngineState(props));
  }, [
    pixiReady,
    useFallback,
    props.lanes,
    props.currentLane,
    props.status,
    props.multipliers,
    props.hopping,
    props.chickenVisible,
    props.bustLane,
    props.bustHazard,
    props.crossAnim,
    props.previewMode,
  ]);

  const statusLabel =
    props.status === "idle"
      ? "Select difficulty & amount, then Play"
      : props.status === "active"
        ? "Go to cross next lane — cash out anytime"
        : props.status === "won"
          ? "Round complete"
          : "Busted";

  if (useFallback) {
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
      />
    );
  }

  return (
    <div className="cr-board-root cr-pixi-board relative rounded-xl overflow-hidden border border-white/10 bg-[#0f2530] shadow-2xl h-full min-h-[280px] flex flex-col">
      <div
        ref={containerRef}
        className="flex-1 w-full min-h-[280px] h-[min(500px,64vh)]"
        aria-label="Chicken Road game board"
      />
      <div className="relative z-10 px-3 py-2 border-t border-white/10 bg-black/50 flex items-center justify-between gap-2 shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/45">
          {statusLabel}
        </span>
        {(props.status === "active" || props.status === "idle") && (
          <span className="text-[10px] font-mono font-bold text-primary shrink-0">
            {props.status === "idle"
              ? `${props.lanes} lanes`
              : `Lane ${props.currentLane + 1} / ${props.lanes}`}
          </span>
        )}
      </div>
    </div>
  );
}
