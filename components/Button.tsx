import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({ variant = "primary", className = "", ...props }: Props) {
  const base =
    "rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-teal-300 text-black hover:bg-teal-200"
      : "border border-white/15 bg-white/5 text-white hover:bg-white/10";
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}
