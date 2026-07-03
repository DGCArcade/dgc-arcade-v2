# DG AI Architecture Design

## Overview
DG AI is a highly privileged, intelligent assistant built exclusively for the platform owner (`fanodgc`) of the DGC Arcade platform. It has full read/write access to the Neon database, GitHub repository, and Render deployments. It uses the Groq Llama 3.3 (70B) model to provide natural language interaction and powerful tool execution.

## Core Components

### 1. Backend Engine (`artifacts/api-server/src/routes/owner-ai.ts`)
The backend route handles the agentic loop, tool execution, and communication with the OpenAI API.
- **Model:** `llama-3.3-70b-versatile` (via Groq)
- **Streaming:** The route will use Server-Sent Events (SSE) to stream tokens back to the client for a real-time chat experience.
- **Agentic Loop:** The server handles `tool_calls` internally, executing the tools against the DB/GitHub/Render, and feeding the results back to the LLM until a final text response is generated.
- **State Management:** The chat history will be persisted in a new database table `admin_ai_messages` so the owner can resume conversations across sessions.

### 2. Tool System (The "Hands" of DG AI)
The AI will be equipped with a comprehensive suite of tools:
- **Database Tools (Drizzle ORM):**
  - `run_db_query`: Execute raw SQL queries (SELECT, UPDATE, INSERT, DELETE) - *Upgraded to allow mutations*
  - `get_platform_stats`: Real-time financial and user metrics
  - `manage_user`: Update balance, ban/unban, change roles
  - `manage_game`: Enable/disable games, update min/max bets, adjust house edge
  - `reconcile_balances`: Fix deposit discrepancies
- **GitHub Tools (via `gh` CLI or Octokit):**
  - `git_status`: Check current branch and uncommitted changes
  - `git_commit_push`: Commit changes with a message and push to `main`
  - `git_diff`: Show changes made to the codebase
- **Render Tools (via Render API):**
  - `trigger_deploy`: Trigger a new deployment of the API or Frontend
  - `get_deploy_status`: Check the status of the latest deployment

### 3. Frontend UI (`artifacts/dgc-arcade/src/components/owner/owner-ai-chat.tsx`)
The frontend will be completely overhauled to support streaming, markdown rendering, and tool execution feedback.
- **Streaming Support:** Consume SSE streams to display text character-by-character.
- **Markdown Rendering:** Use `react-markdown` to render tables, code blocks, and bold text.
- **Action Cards:** When a tool is executed (e.g., a balance is updated), render a visually distinct card showing the action taken.
- **Voice Input:** Maintain the existing Web Speech API integration for voice commands.
- **History Loading:** Load previous chat history on mount.

### 4. Security & Authentication
- **Triple Verification:**
  1. Standard JWT validation (`requireAdmin` middleware)
  2. Role check (`role === "owner"`)
  3. Username check (`username.toLowerCase() === "fanodgc"`)
- **Tool Safety:** While the AI has full access, dangerous operations (like `git_commit_push` or raw `UPDATE` queries) will require explicit confirmation in the prompt, or the AI will be instructed to explain the change before executing.

## Implementation Plan
1. **Database Schema Update:** Add `admin_ai_messages` table to store chat history.
2. **Backend Overhaul:** Rewrite `owner-ai.ts` to support streaming, the new toolset, and GitHub/Render integrations.
3. **Frontend Overhaul:** Update `owner-ai-chat.tsx` to handle SSE streams, render markdown, and display tool execution cards.
4. **Testing:** Verify all tools work correctly in the sandbox environment.
5. **Commit:** Commit the changes to the DGC Arcade repository.
