import React from "react";

/**
 * Professional Horse icon - realistic horse head for Horse Race game
 * Matches the mobile version style
 */
export function HorseIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Horse head profile */}
      <g>
        {/* Muzzle */}
        <path d="M8 12c0-1 .5-2 1-2.5l2-1.5v4l-3 .5z" />
        {/* Nose */}
        <circle cx="9" cy="12" r="0.5" />
        {/* Head */}
        <path d="M10 8c2 0 3.5 1 4 2.5v5c-.5 1.5-2 2.5-4 2.5-1.5 0-2.5-.8-3-2v-5c.5-1.5 1.5-2.5 3-2.5z" />
        {/* Ear */}
        <path d="M13 8.5c.5-.5 1-1 1.5-1.5v2l-1.5.5z" />
        {/* Eye */}
        <circle cx="12.5" cy="10.5" r="0.4" fill="white" />
        <circle cx="12.5" cy="10.5" r="0.2" fill="black" />
        {/* Mane */}
        <path d="M13.5 7.5c.5-.5 1-1 1-1.5M13.5 8c.5-.3 1-.8 1-1.2M13.5 8.5c.5-.2 1-.6 1-1" stroke="currentColor" strokeWidth="0.5" fill="none" />
        {/* Neck */}
        <path d="M13 13.5c.5 1 .8 2 .8 3v2c0 .5-.2 1-.5 1.5" />
      </g>
    </svg>
  );
}

/**
 * Professional Chicken icon - realistic chicken for Chicken Road game
 * Matches the mobile version style
 */
export function ChickenIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Chicken body and head */}
      <g>
        {/* Body */}
        <ellipse cx="12" cy="14" rx="4" ry="5" />
        {/* Head */}
        <circle cx="12" cy="7" r="3" />
        {/* Neck connection */}
        <path d="M12 10c1 .5 1.5 1.5 1.5 2.5M12 10c-1 .5-1.5 1.5-1.5 2.5" />
        {/* Beak */}
        <path d="M14.5 7l2 .5l-2 1z" fill="currentColor" />
        {/* Eye */}
        <circle cx="13.5" cy="6" r="0.5" fill="white" />
        <circle cx="13.5" cy="6" r="0.2" fill="black" />
        {/* Comb on head */}
        <path d="M12 4c.3-.5.5-1 .5-1.5M12.5 4.5c.3-.4.5-.9.5-1.4M11.5 4c-.3-.5-.5-1-.5-1.5" stroke="currentColor" strokeWidth="0.5" fill="none" />
        {/* Wing */}
        <path d="M10 13c-1.5 0-2.5.5-3 1.5" stroke="currentColor" strokeWidth="0.8" fill="none" />
        {/* Tail feathers */}
        <path d="M16 13c1 0 2 .5 2.5 1.5M16 14c1.2 .3 2.2 1 2.5 2M16 15c1 .5 1.8 1.5 2 2.5" stroke="currentColor" strokeWidth="0.6" fill="none" />
        {/* Legs */}
        <path d="M11 19v2M13 19v2" stroke="currentColor" strokeWidth="0.6" />
        {/* Feet */}
        <path d="M11 21l-0.5 0.3l0.5 0.2l0.5 0.3M13 21l-0.5 0.3l0.5 0.2l0.5 0.3" stroke="currentColor" strokeWidth="0.5" fill="none" />
      </g>
    </svg>
  );
}
