# Planka API Guide for AI Agents

This document describes how AI coding agents can interact with your Planka kanban boards via the REST API.

## Authentication

Planka uses JWT token authentication. Get a token by logging in:

```bash
# Login with credentials to get a token
curl -X POST https://YOUR_PLANKA_URL/api/access-tokens \
  -H "Content-Type: application/json" \
  -d '{"emailOrUsername": "YOUR_EMAIL", "password": "YOUR_PASSWORD"}'

# Response contains the JWT token
{"item":"eyJhbGciOiJIUzI1NiIs..."}
```

Save the token — all subsequent requests need it in the Authorization header:

```bash
TOKEN="your-jwt-token-here"
```

## API Endpoints

### Projects

**List all projects:**
```bash
curl -s https://YOUR_PLANKA_URL/api/projects \
  -H "Authorization: Bearer $TOKEN"
```

**Create a project:**
```bash
curl -s -X POST https://YOUR_PLANKA_URL/api/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Project Name", "type": "private"}'
```

**Get project details (includes boards):**
```bash
curl -s https://YOUR_PLANKA_URL/api/projects/PROJECT_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Delete a project (must empty boards first):**
```bash
# First delete all boards, then:
curl -s -X DELETE https://YOUR_PLANKA_URL/api/projects/PROJECT_ID \
  -H "Authorization: Bearer $TOKEN"
```

### Boards

**Create a board in a project:**
```bash
curl -s -X POST https://YOUR_PLANKA_URL/api/projects/PROJECT_ID/boards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Board Name", "position": 1}'
```

**Get board details (includes lists):**
```bash
curl -s https://YOUR_PLANKA_URL/api/boards/BOARD_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Delete a board:**
```bash
curl -s -X DELETE https://YOUR_PLANKA_URL/api/boards/BOARD_ID \
  -H "Authorization: Bearer $TOKEN"
```

### Lists

**Create a list on a board:**
```bash
curl -s -X POST https://YOUR_PLANKA_URL/api/boards/BOARD_ID/lists \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "List Name", "position": 1, "type": "active"}'
```

**Get cards in a list:**
```bash
curl -s https://YOUR_PLANKA_URL/api/lists/LIST_ID/cards \
  -H "Authorization: Bearer $TOKEN"
```

**Delete a list:**
```bash
curl -s -X DELETE https://YOUR_PLANKA_URL/api/lists/LIST_ID \
  -H "Authorization: Bearer $TOKEN"
```

### Cards

**Create a card in a list:**
```bash
curl -s -X POST https://YOUR_PLANKA_URL/api/lists/LIST_ID/cards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Card Title", "boardId": "BOARD_ID", "position": 1, "type": "project"}'
```

**Update card (move, rename, etc.):**
```bash
# Move card to another list
curl -s -X PATCH https://YOUR_PLANKA_URL/api/cards/CARD_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"listId": "TARGET_LIST_ID", "boardId": "BOARD_ID", "position": 1}'

# Rename card
curl -s -X PATCH https://YOUR_PLANKA_URL/api/cards/CARD_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "New Name", "boardId": "BOARD_ID"}'
```

**Delete a card:**
```bash
curl -s -X DELETE https://YOUR_PLANKA_URL/api/cards/CARD_ID \
  -H "Authorization: Bearer $TOKEN"
```

## Data Model

- **Project**: Top-level container with boards. Each project has a `type` ("private" or "shared") and `name`.
- **Board**: Belongs to a project. Contains lists, labels, members.
- **List**: A column on a board. Has `type` ("active", "archive", "trash"), `name`, `position`.
- **Card**: An item in a list. Has `name`, `description`, `position`, `type` ("project"), `listId`, `boardId`.

API responses use Sails.js conventions — JSON body is wrapped in `{"item": {...}}` for singles or `{"items": [...]}` for collections. Included relations are in `{"included": {...}}`.

## Important Notes

- All endpoints require the `Authorization: Bearer` header
- Projects require `type: "private"` on creation
- Cards require `type: "project"` on creation
- Lists require `type: "active"` on creation
- Moving a card requires `listId`, `boardId`, and `position`
- Deleting a project fails if it still has boards — delete boards first
- Enum types for Card: `project`, and List: `active`, `archive`, `trash`
