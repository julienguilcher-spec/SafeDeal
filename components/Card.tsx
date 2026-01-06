import React from "react";

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_14px_40px_rgba(0,0,0,0.35)] ${className}`}
      {...props}
    />
  );
}
