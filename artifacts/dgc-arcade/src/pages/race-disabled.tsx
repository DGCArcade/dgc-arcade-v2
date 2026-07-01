import { Link } from "wouter";
import { Button } from "@/components/ui/button";

/** Shown when /race is visited but raceEnabled is off in platform settings. */
export default function RaceDisabled() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-6 py-16 gap-4">
      <div className="text-5xl">🏇</div>
      <h1 className="font-display font-black text-2xl uppercase tracking-widest">DGC Derby Unavailable</h1>
      <p className="text-sm text-muted-foreground max-w-md">
        Horse racing is turned off right now. Check back later or pick another game from the lobby.
      </p>
      <Link href="/games">
        <Button className="font-display font-bold uppercase tracking-widest">Back to Games</Button>
      </Link>
    </div>
  );
}
