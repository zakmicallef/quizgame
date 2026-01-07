"use client";

import { useEffect, useState, useCallback, use } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Player = {
  id: string;
  name: string;
  is_projector: boolean;
  score: number;
  avatar_color: string;
  joined_at: string;
};

type GameSession = {
  id: string;
  code: string;
  status: "waiting" | "playing" | "finished";
};

export default function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [game, setGame] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch players from database
  const fetchPlayers = useCallback(async (gameId: string) => {
    if (!supabase) return [];
    
    const { data: playersData } = await supabase
      .from("players")
      .select("*")
      .eq("game_id", gameId)
      .order("joined_at", { ascending: true });
    
    return playersData || [];
  }, []);

  useEffect(() => {
    const playerId = localStorage.getItem("playerId");

    if (!supabase) {
      setError("Database not configured");
      setLoading(false);
      return;
    }

    if (!playerId) {
      setError("No player ID found. Please join from home page.");
      setLoading(false);
      return;
    }

    let channel: RealtimeChannel | null = null;
    let mounted = true;

    async function loadGame() {
      // Fetch game
      const { data: gameData, error: gameError } = await supabase!
        .from("game_sessions")
        .select("*")
        .eq("code", code.toUpperCase())
        .single();

      if (gameError || !gameData) {
        if (mounted) {
          setError("Game not found");
          setLoading(false);
        }
        return;
      }

      if (mounted) setGame(gameData);

      // Fetch all players
      const playersData = await fetchPlayers(gameData.id);
      
      if (mounted) {
        setPlayers(playersData);
        
        // Find current player by ID from localStorage
        const me = playersData.find((p) => p.id === playerId);
        if (me) {
          setCurrentPlayer(me);
        } else {
          setError("You are not in this game. Please join from home page.");
          setLoading(false);
          return;
        }
      }

      // Subscribe to ALL player changes for this game
      channel = supabase!
        .channel(`game-players-${gameData.id}`)
        .on(
          "postgres_changes",
          {
            event: "*", // Listen to all events: INSERT, UPDATE, DELETE
            schema: "public",
            table: "players",
            filter: `game_id=eq.${gameData.id}`,
          },
          async (payload) => {
            console.log("Realtime event:", payload.eventType, payload);
            
            if (payload.eventType === "INSERT") {
              const newPlayer = payload.new as Player;
              setPlayers((prev) => {
                // Avoid duplicates
                if (prev.some((p) => p.id === newPlayer.id)) return prev;
                return [...prev, newPlayer];
              });
            } else if (payload.eventType === "DELETE") {
              const oldPlayer = payload.old as { id: string };
              setPlayers((prev) => prev.filter((p) => p.id !== oldPlayer.id));
            } else if (payload.eventType === "UPDATE") {
              const updatedPlayer = payload.new as Player;
              setPlayers((prev) =>
                prev.map((p) => (p.id === updatedPlayer.id ? updatedPlayer : p))
              );
            }
          }
        )
        .subscribe((status, err) => {
          console.log("Realtime subscription:", status, err);
          if (status === "SUBSCRIBED") {
            console.log("✓ Listening for player changes");
          }
          if (status === "CHANNEL_ERROR") {
            console.error("Realtime error:", err);
          }
        });

      if (mounted) setLoading(false);
    }

    loadGame();

    // Poll for updates as backup (every 3 seconds)
    const pollInterval = setInterval(async () => {
      if (game?.id) {
        const freshPlayers = await fetchPlayers(game.id);
        setPlayers(freshPlayers);
      }
    }, 3000);

    return () => {
      mounted = false;
      clearInterval(pollInterval);
      if (channel) {
        console.log("Cleaning up realtime channel");
        supabase?.removeChannel(channel);
      }
    };
  }, [code, fetchPlayers, game?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-zinc-600 border-t-violet-500 rounded-full animate-spin" />
          <span className="text-zinc-400 text-lg">Loading game...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-4">{error}</p>
          <a href="/" className="text-violet-400 hover:underline">← Back to home</a>
        </div>
      </div>
    );
  }

  // Use database is_projector field to determine view
  const isHost = currentPlayer?.is_projector === true;
  const regularPlayers = players.filter((p) => !p.is_projector);
  const host = players.find((p) => p.is_projector);

  // HOST VIEW (Projector)
  if (isHost) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden relative">
        {/* Background effects */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-8">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-6xl font-black tracking-tight mb-4">
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
                QUIZ
              </span>
              <span className="text-white/90">CLASH</span>
            </h1>
            <p className="text-zinc-500 text-lg">
              {regularPlayers.length === 0 
                ? "Waiting for players to join..." 
                : `${regularPlayers.length} player${regularPlayers.length !== 1 ? 's' : ''} joined!`}
            </p>
          </div>

          {/* Game Code Display */}
          <div className="bg-zinc-900/60 backdrop-blur-xl border border-zinc-700 rounded-3xl p-8 mb-12">
            <p className="text-zinc-400 text-center mb-2 text-sm uppercase tracking-wider">Join Code</p>
            <p className="text-7xl font-black text-center tracking-[0.3em] bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              {game?.code}
            </p>
          </div>

          {/* Players Grid */}
          <div className="w-full max-w-4xl">
            <div className="grid grid-cols-4 gap-6">
              {[0, 1, 2, 3].map((slot) => {
                const player = regularPlayers[slot];
                return (
                  <div
                    key={slot}
                    className={`
                      aspect-square rounded-3xl flex flex-col items-center justify-center
                      transition-all duration-500 ease-out
                      ${player
                        ? "bg-zinc-800/80 border-2 scale-100 opacity-100"
                        : "bg-zinc-900/40 border border-dashed border-zinc-700 scale-95 opacity-60"
                      }
                    `}
                    style={{
                      borderColor: player?.avatar_color || undefined,
                      boxShadow: player ? `0 0 40px ${player.avatar_color}30` : undefined,
                    }}
                  >
                    {player ? (
                      <>
                        {/* Avatar */}
                        <div
                          className="w-20 h-20 rounded-full flex items-center justify-center text-4xl font-bold mb-4"
                          style={{ backgroundColor: player.avatar_color }}
                        >
                          {player.name.charAt(0).toUpperCase()}
                        </div>
                        {/* Name */}
                        <p className="text-xl font-bold text-white">{player.name}</p>
                        <p className="text-zinc-500 text-sm">Player {slot + 1}</p>
                      </>
                    ) : (
                      <>
                        <div className="w-20 h-20 rounded-full bg-zinc-800/50 flex items-center justify-center mb-4">
                          <span className="text-4xl text-zinc-600">?</span>
                        </div>
                        <p className="text-zinc-600 text-lg">Waiting...</p>
                        <p className="text-zinc-700 text-sm">Player {slot + 1}</p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Player Count & Start Button */}
          <div className="mt-12 text-center">
            <p className="text-2xl font-bold">
              <span className="text-violet-400">{regularPlayers.length}</span>
              <span className="text-zinc-600"> / 4 players</span>
            </p>
            {regularPlayers.length >= 1 && (
              <button className="mt-6 px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white rounded-2xl font-bold text-xl transition-all transform hover:scale-105">
                Start Game →
              </button>
            )}
          </div>

          {/* Host info */}
          {host && (
            <div className="absolute bottom-8 left-8 flex items-center gap-3 text-zinc-500">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
                style={{ backgroundColor: host.avatar_color }}
              >
                {host.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-white font-medium">{host.name}</p>
                <p className="text-xs uppercase tracking-wider">Host</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // PLAYER VIEW
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background: currentPlayer?.avatar_color
            ? `radial-gradient(circle at center, ${currentPlayer.avatar_color}40 0%, transparent 70%)`
            : undefined,
        }}
      />

      <div className="relative z-10 text-center">
        {/* Player Avatar */}
        <div
          className="w-32 h-32 rounded-full flex items-center justify-center text-6xl font-bold mx-auto mb-6 shadow-2xl"
          style={{
            backgroundColor: currentPlayer?.avatar_color || "#6366f1",
            boxShadow: `0 0 60px ${currentPlayer?.avatar_color || "#6366f1"}50`,
          }}
        >
          {currentPlayer?.name.charAt(0).toUpperCase() || "?"}
        </div>

        {/* Player Name */}
        <h1 className="text-4xl font-black mb-2">{currentPlayer?.name}</h1>
        <p className="text-zinc-500 text-lg mb-12">You're in!</p>

        {/* Game Code */}
        <div className="bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 rounded-2xl px-8 py-6 mb-8">
          <p className="text-zinc-500 text-sm mb-1">Game Code</p>
          <p className="text-3xl font-black tracking-[0.2em] text-white">{game?.code}</p>
        </div>

        {/* Status */}
        <div className="flex items-center justify-center gap-3 text-zinc-400">
          <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
          <span>Waiting for host to start...</span>
        </div>

        {/* Other Players */}
        <div className="mt-12">
          <p className="text-zinc-600 text-sm mb-4">Players joined ({regularPlayers.length})</p>
          <div className="flex justify-center gap-3 flex-wrap">
            {regularPlayers.map((p) => (
              <div
                key={p.id}
                className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-all ${
                  p.id === currentPlayer?.id ? "ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0f]" : ""
                }`}
                style={{ backgroundColor: p.avatar_color }}
                title={p.name}
              >
                {p.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
