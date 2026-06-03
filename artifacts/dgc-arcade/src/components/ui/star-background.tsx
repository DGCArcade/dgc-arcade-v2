import { useMemo } from "react";

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  animClass: string;
}

export function StarBackground() {
  const stars = useMemo<Star[]>(() => {
    const classes = ["twinkle-a", "twinkle-b", "twinkle-c"];
    return Array.from({ length: 220 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.2 + 0.4,
      opacity: Math.random() * 0.6 + 0.2,
      duration: Math.random() * 4 + 2,
      delay: Math.random() * 5,
      animClass: classes[Math.floor(Math.random() * classes.length)],
    }));
  }, []);

  return (
    <div className="star-field" aria-hidden="true">
      {stars.map((star) => (
        <div
          key={star.id}
          style={{
            position: "absolute",
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            borderRadius: "50%",
            background: star.size > 1.8 ? "rgba(255,215,0,0.9)" : "rgba(255,255,255,0.95)",
            boxShadow: star.size > 1.8
              ? `0 0 ${star.size * 2}px rgba(255,215,0,0.6)`
              : `0 0 ${star.size}px rgba(255,255,255,0.5)`,
            animationName: star.animClass === "twinkle-a" ? "twinkle-a" : star.animClass === "twinkle-b" ? "twinkle-b" : "twinkle-c",
            animationDuration: `${star.duration}s`,
            animationDelay: `${star.delay}s`,
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
            animationDirection: "alternate",
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(67,56,202,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
