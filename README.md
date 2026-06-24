# ToDoListTool

A local task manager with a browser-based interface and JSON-file persistence.

## Features

- Create tasks with title, description, due date, priority, and status
- Edit tasks inline
- Filter tasks by text, status, and priority
- Add, toggle, and delete subtasks
- Reorder subtasks with drag and drop
- Import and export the full JSON store
- Persist everything in `data/todos.json`
- Runs locally with Node.js and Express

## Development

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

## Docker

Run the app with Docker Compose:

```bash
docker compose up --build
```

This exposes the app on `http://localhost:3000` and mounts `./data` into the container so `data/todos.json` stays persistent on your machine.

## Data storage

The app reads and writes a single JSON file at `data/todos.json`. You can inspect or back up that file directly.
