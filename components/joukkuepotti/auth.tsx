"use client";
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
export function Auth({
  db,
  recovery = false,
  onRecovered,
}: {
  db: SupabaseClient;
  recovery?: boolean;
  onRecovered: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (recovery) {
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        onRecovered();
        return;
      }
      if (mode === "reset") {
        const { error } = await db.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setMessage("Jos sähköpostilla on tili, saat salasanan vaihtolinkin.");
      } else if (mode === "signup") {
        const { error } = await db.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setMessage(
          "Tarkista sähköpostisi. Vahvista osoitteesi ennen kirjautumista.",
        );
      } else {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch {
      setError(
        mode === "login"
          ? "Kirjautuminen ei onnistunut. Tarkista sähköposti, salasana ja osoitteen vahvistus."
          : "Toiminto ei onnistunut. Yritä hetken kuluttua uudelleen.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="setup">
      <p className="eyebrow">JOUKKUEEN OMA TYÖPÖYTÄ</p>
      <h1>
        {recovery
          ? "Vaihda salasana"
          : mode === "signup"
            ? "Luo oma tili"
            : mode === "reset"
              ? "Unohtuiko salasana?"
              : "Tervetuloa takaisin"}
      </h1>
      <p className="muted">
        {recovery
          ? "Valitse uusi, vähintään 12 merkin salasana."
          : "Hallitse pelaajia ja jaa joukkueen yhteiset kulut."}
      </p>
      <form onSubmit={submit}>
        {!recovery && (
          <label>
            Sähköposti
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        {(recovery || mode !== "reset") && (
          <label>
            Salasana
            <input
              type="password"
              required
              minLength={recovery || mode === "signup" ? 12 : 1}
              autoComplete={
                mode === "login" && !recovery
                  ? "current-password"
                  : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
            {mode === "signup" && (
              <span className="smallhelp">Vähintään 12 merkkiä.</span>
            )}
          </label>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="successbox" role="status">
            {message}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy
            ? "Odota hetki…"
            : recovery
              ? "Tallenna uusi salasana"
              : mode === "signup"
                ? "Luo tili"
                : mode === "reset"
                  ? "Lähetä vaihtolinkki"
                  : "Kirjaudu sisään"}
        </button>
      </form>
      {!recovery && (
        <div className="auth-buttons sectiongap">
          <button
            className="textbtn"
            disabled={busy}
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError("");
              setMessage("");
            }}
          >
            {mode === "login" ? "Luo uusi tili" : "Takaisin kirjautumiseen"}
          </button>
          {mode === "login" && (
            <button
              className="textbtn"
              disabled={busy}
              onClick={() => {
                setMode("reset");
                setError("");
                setMessage("");
              }}
            >
              Unohdin salasanan
            </button>
          )}
        </div>
      )}
    </section>
  );
}
