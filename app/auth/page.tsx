"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Mode = "signin" | "signup";

export default function AuthPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let ignore = false;

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!ignore && data.session) {
        router.replace("/app");
      }
    }

    checkSession();

    return () => {
      ignore = true;
    };
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (!email.trim() || !password.trim()) {
        setMessage("Please enter an email and a password.");
        return;
      }

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        router.replace("/app");
        return;
      }

      // signup
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage(
        "Account created. If email confirmation is enabled, check your inbox. Otherwise you can sign in now."
      );
      setMode("signin");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">SafeDeal</h1>
          <p className="text-white/70 mt-1">
            {mode === "signin"
              ? "Sign in to continue."
              : "Create your account to start using SafeDeal."}
          </p>
        </div>

        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm border ${
              mode === "signin"
                ? "bg-white text-black border-white"
                : "bg-transparent text-white border-white/15 hover:border-white/30"
            }`}
          >
            Sign in
          </button>

          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm border ${
              mode === "signup"
                ? "bg-white text-black border-white"
                : "bg-transparent text-white border-white/15 hover:border-white/30"
            }`}
          >
            Create account
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-white/70">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder="you@email.com"
              className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
            />
          </div>

          <div>
            <label className="text-sm text-white/70">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              placeholder="••••••••"
              className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
            />
            <p className="text-xs text-white/50 mt-2">
              Use at least 6 characters.
            </p>
          </div>

          {message ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
              {message}
            </div>
          ) : null}

          <button
            disabled={loading}
            type="submit"
            className="w-full rounded-xl bg-white text-black px-4 py-2 font-medium disabled:opacity-60"
          >
            {loading
              ? "Please wait..."
              : mode === "signin"
              ? "Sign in"
              : "Create account"}
          </button>
        </form>

        <div className="mt-5 text-xs text-white/50">
          If you enabled email confirmation in Supabase, you must confirm your
          email before signing in.
        </div>
      </div>
    </main>
  );
}
