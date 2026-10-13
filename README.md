# Atlas of Social Progress

An atlas of work aimed at social progress.

A graph of problems, organizations, and people for **Leonidas Bothmer**.

## Stack

- **Next.js** (App Router) + TypeScript
- **Tailwind CSS** + **shadcn/ui**
- **@xyflow/react** for the interactive graph
- **Supabase** — auth and the live graph (shared nodes, private people and contacts, layouts, focus zones)
- **Local JSON fallback** — [`data/mindmap.json`](data/mindmap.json) and gitignored `data/private.json`, used only when Supabase env vars are absent

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:4317](http://localhost:4317). Copy [`.env.example`](.env.example) to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. With those set, the app reads and writes the linked Supabase project.

### Hosting

Deploy to Vercel with the same three env vars. Production refuses to start without the public Supabase pair.

## Features

- **Node types** with distinct styling: `problem`, `solution`, `organization`, `person`
- **Person nodes** render as circular avatars with the name below; click opens the detail panel
- **Force-directed layout** via **d3-force** (default) — nodes settle by links; optional `pinned` flag reserved for future drag-to-pin (`fx`/`fy`)
- **Remote avatars/logos** — LinkedIn/OG `imageUrl` stored as hotlinks (not downloaded into `public/`)
- **Pan/zoom** graph canvas with minimap and controls
- **Click a node** to view and edit details in the side panel
- **Drag node handles** or use the panel to create labeled relationships
- **Add nodes** via the header form
- **Export / import** JSON backup from the UI
- **Auto-save** node positions after the force sim settles / after dragging (debounced)

## Data model

All nodes share: `id`, `name`, `type`, `notes`, `tags`, `position`, optional `pinned`.

| Type | Extra fields |
|------|-------------|
| `organization` | `orgKind`, `orgEmail`, `website`, `careerPage` (careers URL), `linkedIn`, `imageUrl` (remote logo preferred) |
| `person` | `phone`, `email`, `linkedIn`, `imageUrl` (remote LinkedIn/OG preferred; circular avatar) |

Use tag `contacted` on people you’ve already reached out to.

Edges: `id`, `source`, `target`, optional `label`.

The live graph is in Supabase. `data/mindmap.json` is only the offline fallback.

## API (`/api/mindmap`)

| Method | Purpose |
|--------|---------|
| `GET` | Read the full mind map |
| `PUT` | Replace the entire mind map |
| `POST` | Apply a single action (see below) |

**POST body actions:**

```json
{ "action": "addNode", "node": { ... } }
{ "action": "updateNode", "node": { ... } }
{ "action": "deleteNode", "id": "node-id" }
{ "action": "addEdge", "edge": { ... } }
{ "action": "updateEdge", "edge": { ... } }
{ "action": "deleteEdge", "id": "edge-id" }
{ "action": "replace", "data": { "nodes": [], "edges": [] } }
```

## Extend via Cursor chat

You can grow this map without touching the UI. In Cursor, describe what you want and an agent can update it through the API while the dev server is running (that writes to Supabase when env vars are set).

**Example prompts:**

> Add a person node for Jane Doe who works at Autarc. Connect her to Autarc and to the heating solution area. Tag her as "contact".

> Add a new problem node "Biodiversity loss" connected to climate change. Add notes about nature-based solutions.

> Update Reonic's notes with my interview takeaways: strong product team, Series A, remote-friendly.

**How agents should update data:**

While the dev server is running and you are signed in:

```bash
curl -X POST http://localhost:4317/api/mindmap \
  -H "Content-Type: application/json" \
  -d '{"action":"addNode","node":{"id":"jane-doe","name":"Jane Doe","type":"person","email":"jane@example.com","tags":["contact"],"position":{"x":800,"y":300}}}'
```

Use kebab-case ids. Refresh the browser to see changes.

## Project structure

```
data/mindmap.json          # offline fallback only
src/app/api/mindmap/       # CRUD API routes
src/components/            # graph, panel, forms
src/lib/mindmap-store.ts   # Supabase (or file fallback)
src/types/mindmap.ts       # shared types
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on port **4317** |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
