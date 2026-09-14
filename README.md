# Impact Mind Map

A purpose-driven job-search mind map for **Leonidas Bothmer**. Explore impact areas, organizations, and relationships as an interactive graph network.

## Stack

- **Next.js** (App Router) + TypeScript
- **Tailwind CSS** + **shadcn/ui**
- **@xyflow/react** for the interactive graph
- **File-based persistence** — `data/mindmap.json` (no database, no API keys)

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:4317](http://localhost:4317).

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
| `organization` | `orgKind`, `orgEmail`, `website`, `linkedIn`, `imageUrl` (remote logo preferred) |
| `person` | `phone`, `email`, `linkedIn`, `imageUrl` (remote LinkedIn/OG preferred; circular avatar) |

Use tag `contacted` on people you’ve already reached out to.

Edges: `id`, `source`, `target`, optional `label`.

Seed data lives in [`data/mindmap.json`](data/mindmap.json).

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

You can grow this map without touching the UI. In Cursor, describe what you want and an agent can update the data file directly or via the API.

**Example prompts:**

> Add a person node for Jane Doe who works at Autarc. Connect her to Autarc and to the heating solution area. Tag her as "contact".

> Add a new problem node "Biodiversity loss" connected to climate change. Add notes about nature-based solutions.

> Update Reonic's notes with my interview takeaways: strong product team, Series A, remote-friendly.

**How agents should update data:**

1. **Direct edit (preferred for bulk changes):** edit `data/mindmap.json`, keeping valid JSON and unique `id` values. Use kebab-case ids (e.g. `"jane-doe"`).
2. **Via API while dev server is running:**
   ```bash
   curl -X POST http://localhost:4317/api/mindmap \
     -H "Content-Type: application/json" \
     -d '{"action":"addNode","node":{"id":"jane-doe","name":"Jane Doe","type":"person","email":"jane@example.com","tags":["contact"],"position":{"x":800,"y":300}}}'
   ```

After file edits, refresh the browser to see changes (or rely on the UI save flow for position updates).

## Project structure

```
data/mindmap.json          # persisted graph data
src/app/api/mindmap/       # CRUD API routes
src/components/            # graph, panel, forms
src/lib/mindmap-store.ts   # file read/write (server)
src/types/mindmap.ts       # shared types
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on port **4317** |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
