# 🎉 Quiz Preference Game

## Overview

This is a real-time multiplayer quiz game designed for **4 players**.  
The game is played using a **projector (shared screen)** and **players' phones**.

**The twist:**  
Questions are based on players' personal preferences, and players must guess who the question is about.

> The Question Master is powered by AI.

---

## How the Game Works

### 1. Game Setup

- The first person to visit the site becomes the **Projector Screen**
- Other players join from their phones:
  - Enter their name
  - Answer a short preference questionnaire (food, games, films, entertainment, etc.)
- The game supports **4 players** total

### 2. Question Rounds

- The AI generates questions based on player preferences
- Each question:
  - Is about one specific player
  - Has multiple-choice answers
  - Is displayed on the projector
- Players answer on their phones

### 3. Timing & Scoring

Each question has a **20-second timer**.

| Action | Points |
|--------|--------|
| 🟢 Correct guess | +1 point |
| 🟢 If the person the question is about answers correctly | +2 points |
| 🔴 If the person the question is about answers incorrectly | −1 point |
| ⏱️ If time runs out for everyone | Associated player loses −1 point |

**The projector shows:**
- Who answered
- Who gained or lost points

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js |
| Backend & Realtime | Supabase (auth, database, realtime events) |
| Hosting | Vercel |
| AI | OpenAI API (question generation & logic) |

---

## Development Constraints

⏱️ **Time limit:** 2 hours

**Goal is rapid development using:**
- Supabase for auth, DB, and realtime
- Next.js for fast UI
- Vercel for instant deployment

---

## High-Level Strategy

### Supabase Setup

**Tables:**
- `players`
- `preferences`
- `questions`
- `scores`
- `game_state`

Use **Supabase Realtime** for live updates.

### Next.js App

| Route | Purpose |
|-------|---------|
| `/` | Auto-detect projector vs player |
| `/join` | Player name + preference form |
| `/projector` | Question display & scoreboard |
| `/play` | Answer selection UI |

### Game Logic

- AI generates questions from stored preferences
- Timer handled client-side, synced via Supabase
- Scores updated centrally in the database

### Deployment

1. Push to GitHub
2. Deploy on Vercel
3. Connect Supabase environment variables

---

## Goal

A fast, fun, social quiz game that works instantly with:

- ✅ One shared screen
- ✅ Multiple phones
- ✅ Zero setup friction
