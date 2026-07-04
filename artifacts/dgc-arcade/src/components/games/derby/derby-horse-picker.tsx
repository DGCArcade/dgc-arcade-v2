import { DerbyHorse, HorseSilkBadge, type RacerDef } from "./derby-horse";
import { Check } from "lucide-react";

const WIN_MULTIPLIER = 5.5;

type DerbyHorsePickerProps = {
  racers: RacerDef[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function DerbyHorsePicker({
  racers,
  selectedId,
  onSelect,
  disabled = false,
  compact = false,
}: DerbyHorsePickerProps) {
  if (compact) {
    return (
      <div className="race-horse-strip">
        <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
          <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
            Pick horse · 1st = {WIN_MULTIPLIER}×
          </span>
          {selectedId != null && (() => {
            const sel = racers.find(r => r.id === selectedId);
            return sel ? <HorseSilkBadge r={sel} size="sm" highlight /> : null;
          })()}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5 scrollbar-none">
          {racers.map(r => (
            <HorseCard
              key={r.id}
              r={r}
              selected={selectedId === r.id}
              disabled={disabled}
              compact
              onSelect={() => onSelect(r.id)}
            />
          ))}
        </div>
      </div>
    );
  }

  const selected = racers.find(r => r.id === selectedId);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-display font-black text-sm uppercase tracking-widest text-foreground">
          Choose Your Horse
        </h3>
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
          Six runners compete each race. Tap a horse below — you are betting on that runner to finish{" "}
          <span className="text-primary font-bold">1st place</span>. A win pays up to{" "}
          <span className="font-mono font-bold text-yellow-400">{WIN_MULTIPLIER}×</span> your stake
          (house edge applied).
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {racers.map(r => (
          <HorseCard
            key={r.id}
            r={r}
            selected={selectedId === r.id}
            disabled={disabled}
            onSelect={() => onSelect(r.id)}
          />
        ))}
      </div>

      {selected && (
        <div
          className="flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 bg-secondary/40"
          style={{ borderColor: selected.silk }}
        >
          <DerbyHorse r={selected} gallop={false} scale={0.72} showBadge />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Your pick
            </div>
            <div className="font-display font-black text-base uppercase tracking-wide truncate" style={{ color: selected.silk }}>
              #{selected.num} {selected.name}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
              Pays {WIN_MULTIPLIER}× if 1st · any other place loses
            </div>
          </div>
          <Check className="w-5 h-5 shrink-0 text-green-400" aria-hidden />
        </div>
      )}
    </div>
  );
}

function HorseCard({
  r,
  selected,
  disabled,
  compact = false,
  onSelect,
}: {
  r: RacerDef;
  selected: boolean;
  disabled: boolean;
  compact?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Horse ${r.num} ${r.name}`}
      className={`race-horse-btn group relative flex flex-col items-center rounded-xl border transition-all font-bold disabled:opacity-50 ${
        compact
          ? "p-1.5 min-w-[56px] text-[9px] shrink-0"
          : "p-3 gap-1.5 text-xs min-h-[108px]"
      } ${
        selected
          ? "border-2 shadow-lg shadow-black/20"
          : "border-border/50 hover:border-border bg-secondary/25 hover:bg-secondary/40"
      }`}
      style={
        selected
          ? { borderColor: r.silk, backgroundColor: `${r.silk}14`, boxShadow: `0 0 0 1px ${r.silk}33` }
          : undefined
      }
    >
      <div
        className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${compact ? "h-0.5" : "h-1.5"}`}
        style={{ backgroundColor: r.silk }}
      />
      <HorseSilkBadge r={r} size={compact ? "sm" : "md"} highlight={selected} />
      <DerbyHorse r={r} gallop={selected && !disabled} scale={compact ? 0.5 : 0.78} showBadge={false} />
      <span className="font-mono font-black text-[11px]" style={{ color: r.silk }}>
        #{r.num}
      </span>
      <span className={`font-display uppercase tracking-wide ${compact ? "truncate max-w-[52px] text-[8px]" : "text-sm"}`}>
        {r.name}
      </span>
      {!compact && (
        <span className="text-[9px] text-muted-foreground font-mono opacity-80 group-hover:opacity-100">
          Win {WIN_MULTIPLIER}×
        </span>
      )}
      {selected && (
        <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
