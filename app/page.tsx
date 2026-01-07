"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [gameCode, setGameCode] = useState("");
  const [mode, setMode] = useState<"select" | "create" | "join">("select");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreateGame = async () => {
    if (!name.trim()) {
      setError("Enter your name");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/game/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: name }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create game");
        return;
      }

      // Store player info in localStorage
      localStorage.setItem("playerId", data.player.id);
      localStorage.setItem("playerName", data.player.name);
      localStorage.setItem("isProjector", "true");

      router.push(`/game/${data.game.code}`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGame = async () => {
    if (!name.trim()) {
      setError("Enter your name");
      return;
    }
    if (!gameCode.trim()) {
      setError("Enter game code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/game/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: name, gameCode: gameCode.toUpperCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to join game");
        return;
      }

      localStorage.setItem("playerId", data.player.id);
      localStorage.setItem("playerName", data.player.name);
      localStorage.setItem("isProjector", "false");

      router.push(`/game/${data.game.code}`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center p-4 overflow-hidden relative">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-violet-600/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-cyan-500/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <main className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="text-5xl font-black tracking-tight mb-2">
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              QUIZ
            </span>
            <span className="text-white/90">CLASH</span>
          </h1>
          <p className="text-zinc-500 text-sm tracking-wide">AI-Powered Multiplayer Quiz</p>
        </div>

        {mode === "select" && (
          <div className="space-y-4">
            <button
              onClick={() => setMode("create")}
              className="w-full py-5 px-6 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-2xl font-bold text-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-violet-500/25"
            >
              🎮 Host New Game
            </button>
            <button
              onClick={() => setMode("join")}
              className="w-full py-5 px-6 bg-zinc-800/80 hover:bg-zinc-700/80 text-white rounded-2xl font-bold text-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] border border-zinc-700"
            >
              🚀 Join Game
            </button>
          </div>
        )}

        {mode === "create" && (
          <div className="bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 space-y-6">
            <button
              onClick={() => { setMode("select"); setError(""); }}
              className="text-zinc-500 hover:text-white text-sm flex items-center gap-2 transition-colors"
            >
              ← Back
            </button>
            
            <h2 className="text-2xl font-bold">Host a Game</h2>
            
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                maxLength={20}
                className="w-full px-4 py-4 bg-zinc-800/80 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition-colors text-lg"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-lg">{error}</p>
            )}

            <button
              onClick={handleCreateGame}
              disabled={loading}
              className="w-full py-4 px-6 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg transition-all"
            >
              {loading ? "Creating..." : "Create Game"}
            </button>
          </div>
        )}

        {mode === "join" && (
          <div className="bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 space-y-6">
            <button
              onClick={() => { setMode("select"); setError(""); }}
              className="text-zinc-500 hover:text-white text-sm flex items-center gap-2 transition-colors"
            >
              ← Back
            </button>
            
            <h2 className="text-2xl font-bold">Join a Game</h2>
            
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                maxLength={20}
                className="w-full px-4 py-4 bg-zinc-800/80 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors text-lg"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Game Code</label>
              <input
                type="text"
                value={gameCode}
                onChange={(e) => setGameCode(e.target.value.toUpperCase())}
                placeholder="XXXX"
                maxLength={4}
                className="w-full px-4 py-4 bg-zinc-800/80 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors text-2xl text-center tracking-[0.5em] font-mono uppercase"
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-lg">{error}</p>
            )}

            <button
              onClick={handleJoinGame}
              disabled={loading}
              className="w-full py-4 px-6 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg transition-all"
            >
              {loading ? "Joining..." : "Join Game"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
