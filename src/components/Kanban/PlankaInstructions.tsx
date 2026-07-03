import { useState } from "react";

interface Props {
  config?: {
    baseUrl: string;
    email: string;
    password?: string;
    token?: string;
    selectedProjectId?: string;
    selectedProjectName?: string;
    selectedBoardId?: string;
    selectedBoardName?: string;
  };
  onClose: () => void;
}

export function PlankaInstructions({ config, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [section, setSection] = useState<"api" | "setup">(config?.token ? "api" : "setup");

  const getInstructions = () => `You can interact with my Planka kanban board via its REST API.

# Authentication
Base URL: ${config?.baseUrl || "<PLANKA_URL>"}

Get a token:
\`\`\`bash
curl -X POST ${config?.baseUrl || "<PLANKA_URL>"}/api/access-tokens \\
  -H "Content-Type: application/json" \\
  -d '{"emailOrUsername": "${config?.email || "<EMAIL>"}", "password": "${config?.password || "<PASSWORD>"}"}'
\`\`\`

# Current Context
${config?.selectedBoardId ? `- **Project**: ${config.selectedProjectName} (id: ${config.selectedProjectId})
- **Board**: ${config.selectedBoardName} (id: ${config.selectedBoardId})` : `- Not connected to any board yet.`}

# API Endpoints

## Get board details (includes lists)
\`\`\`bash
curl -s ${config?.baseUrl || "<PLANKA_URL>"}/api/boards/BOARD_ID \\
  -H "Authorization: Bearer $TOKEN"
\`\`\`

## Get cards in a list
\`\`\`bash
curl -s ${config?.baseUrl || "<PLANKA_URL>"}/api/lists/LIST_ID/cards \\
  -H "Authorization: Bearer $TOKEN"
\`\`\`

## Create a card
\`\`\`bash
curl -s -X POST ${config?.baseUrl || "<PLANKA_URL>"}/api/lists/LIST_ID/cards \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"name": "Card Title", "boardId": "BOARD_ID", "position": 1, "type": "project"}'
\`\`\`

## Move a card
\`\`\`bash
curl -s -X PATCH ${config?.baseUrl || "<PLANKA_URL>"}/api/cards/CARD_ID \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"listId": "NEW_LIST_ID", "boardId": "BOARD_ID", "position": 1}'
\`\`\`

## Delete a card
\`\`\`bash
curl -s -X DELETE ${config?.baseUrl || "<PLANKA_URL>"}/api/cards/CARD_ID \\
  -H "Authorization: Bearer $TOKEN"
\`\`\`

## Create a list
\`\`\`bash
curl -s -X POST ${config?.baseUrl || "<PLANKA_URL>"}/api/boards/BOARD_ID/lists \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"name": "List Name", "position": 1, "type": "active"}'
\`\`\`

## Create a project
\`\`\`bash
curl -s -X POST ${config?.baseUrl || "<PLANKA_URL>"}/api/projects \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"name": "Project Name", "type": "private"}'
\`\`\`

## Create a board
\`\`\`bash
curl -s -X POST ${config?.baseUrl || "<PLANKA_URL>"}/api/projects/PROJECT_ID/boards \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"name": "Board Name", "position": 1}'
\`\`\`

## Required Fields
- Projects: \`type\` = "private"
- Lists: \`type\` = "active"
- Cards: \`type\` = "project", also need \`boardId\`
- Moving cards: need \`listId\`, \`boardId\`, \`position\`
- Deleting project: delete all boards first`;

  const getDockerInstructions = () => `# How to Host Planka Yourself

## Option 1: Docker Compose (Recommended)

Create a \`docker-compose.yml\`:

\`\`\`yaml
version: '3.8'
services:
  planka:
    image: ghcr.io/plankanban/planka:latest
    ports:
      - "5000:1337"
    environment:
      - BASE_URL=http://localhost:5000
      - DATABASE_URL=postgresql://postgres:postgres@planka-db:5432/planka
      - SECRET_KEY=your-secret-key-change-this
    depends_on:
      - planka-db
    restart: unless-stopped
  planka-db:
    image: postgres:16-alpine
    volumes:
      - planka-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=planka
      - POSTGRES_PASSWORD=postgres
    restart: unless-stopped
volumes:
  planka-data:
\`\`\`

Run:
\`\`\`bash
docker compose up -d
\`\`\`

## Option 2: Deploy on Render.com

1. Fork [github.com/plankanban/planka](https://github.com/plankanban/planka)
2. Create a new **Web Service** on Render
3. Build command: \`npm install && npm run build\`
4. Start command: \`npm start\`
5. Environment variables:
   - \`BASE_URL\`: https://your-app.onrender.com
   - \`DATABASE_URL\`: Your PostgreSQL URL
   - \`SECRET_KEY\`: Random secret string

## Option 3: Supabase PostgreSQL

1. Create a Supabase project
2. Go to Project Settings → Database → Connection string
3. Use the **IPv4 pooled** connector (port 6543):
   \`\`\`
   postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
   \`\`\`
4. Use this as the \`DATABASE_URL\` for your Planka instance

## First-Time Setup

1. Open Planka in your browser
2. Create an admin account (first user becomes admin automatically)
3. Create a project, then a board, then start adding cards`;

  const handleCopy = async () => {
    const text = getInstructions();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#f5f0e8] dark:bg-[#1a1a1a] border-4 border-black dark:border-[#333] shadow-[8px_8px_0px_0px_#000] dark:shadow-[8px_8px_0px_0px_#333] w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black dark:border-[#333] bg-[#ffcc00] shrink-0">
          <span className="font-['Space_Grotesk'] font-black text-xs uppercase tracking-widest text-[#1a1a1a]">Planka Agent Instructions</span>
          <button onClick={onClose} className="text-[#1a1a1a] hover:text-[#e63b2e] font-black text-lg leading-none" type="button">✕</button>
        </div>

        <div className="flex border-b-2 border-black dark:border-[#333] shrink-0">
          {config?.token && (
            <button onClick={() => setSection("api")} className={`flex-1 px-3 py-2 text-[10px] font-['Space_Grotesk'] font-black uppercase ${section === "api" ? "bg-[#ffcc00] text-[#1a1a1a]" : "text-[#888] hover:text-[#ffcc00]"}`} type="button">API Instructions</button>
          )}
          <button onClick={() => setSection("setup")} className={`flex-1 px-3 py-2 text-[10px] font-['Space_Grotesk'] font-black uppercase ${section === "setup" || !config?.token ? "bg-[#ffcc00] text-[#1a1a1a]" : "text-[#888] hover:text-[#ffcc00]"}`} type="button">Docker / Self-Host</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <pre className="font-mono text-[10px] leading-relaxed text-[#1a1a1a] dark:text-[#ddd] whitespace-pre-wrap">
            {section === "setup" ? getDockerInstructions() : getInstructions()}
          </pre>
        </div>

        <div className="flex justify-end px-4 py-3 border-t-2 border-black dark:border-[#333] shrink-0 gap-2">
          {section === "api" && (
            <button onClick={handleCopy} className="text-xs font-['Space_Grotesk'] font-black uppercase px-4 py-2 bg-[#ffcc00] text-[#1a1a1a] border-2 border-black hover:bg-[#f0c000]" type="button">{copied ? "✓ Copied!" : "Copy to Clipboard"}</button>
          )}
          <button onClick={onClose} className="text-xs font-['Space_Grotesk'] font-black uppercase px-4 py-2 border-2 border-black dark:border-[#333] text-[#1a1a1a] dark:text-[#f5f0e8] hover:bg-white dark:hover:bg-[#333]" type="button">Close</button>
        </div>
      </div>
    </div>
  );
}
