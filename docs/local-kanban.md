# Local Kanban API Guide for AI Agents

REST API for the Nexus kanban board, running on `http://127.0.0.1:7878`.

## Endpoints

### GET /api/kanban/tasks — list all tasks
```
curl -s http://127.0.0.1:7878/api/kanban/tasks
```

### POST /api/kanban/tasks — create a task
`id` is optional — auto-generated if omitted. Returns 201.
```
curl -s -X POST http://127.0.0.1:7878/api/kanban/tasks \
  -H "Content-Type: application/json" \
  -d '{"project_id":"PROJECT_ID","title":"Task title","status":"todo"}'
```

### PUT /api/kanban/tasks/:id — update a task
Send the full object. Returns 404 if the task doesn't exist.
```
curl -s -X PUT http://127.0.0.1:7878/api/kanban/tasks/TASK_ID \
  -H "Content-Type: application/json" \
  -d '{"id":"TASK_ID","project_id":"PROJECT_ID","title":"Updated title","status":"in-progress"}'
```

### DELETE /api/kanban/tasks/:id — delete a task
```
curl -s -X DELETE http://127.0.0.1:7878/api/kanban/tasks/TASK_ID
```

### POST /api/kanban/refresh — reload from disk
Discards in-memory changes and reloads from `nexus_web_state.json`. Use after direct file edits.
```
curl -s -X POST http://127.0.0.1:7878/api/kanban/refresh
```

## Task object fields

| Field | Type | Required |
|-------|------|----------|
| `id` | string | auto-generated on create |
| `project_id` | string | yes |
| `title` | string | yes |
| `status` | string | yes |
| `description` | string \| null | no |
| `color` | string \| null | no |

## Status values

`todo`, `in-progress`, `done`, `blocked`
