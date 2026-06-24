import express from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'todos.json');

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

if (!existsSync(dataFile)) {
  writeFileSync(dataFile, JSON.stringify({ tasks: [] }, null, 2));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readStore() {
  const raw = readFileSync(dataFile, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
    };
  } catch {
    return { tasks: [] };
  }
}

function writeStore(store) {
  writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

function normalizeStore(store) {
  return {
    tasks: Array.isArray(store?.tasks) ? store.tasks.map(normalizeTask).filter(Boolean) : []
  };
}

function normalizeSubtasks(subtasks) {
  if (!Array.isArray(subtasks)) {
    return [];
  }

  return subtasks
    .filter((subtask) => subtask && typeof subtask.title === 'string' && subtask.title.trim())
    .map((subtask) => ({
      id: subtask.id || randomUUID(),
      title: subtask.title.trim(),
      done: Boolean(subtask.done)
    }));
}

function normalizeTask(task) {
  const title = typeof task.title === 'string' ? task.title.trim() : '';

  if (!title) {
    return null;
  }

  return {
    id: task.id || randomUUID(),
    title,
    description: typeof task.description === 'string' ? task.description.trim() : '',
    dueDate: typeof task.dueDate === 'string' ? task.dueDate : '',
    priority: ['low', 'medium', 'high'].includes(task.priority) ? task.priority : 'medium',
    status: ['todo', 'in-progress', 'done'].includes(task.status) ? task.status : 'todo',
    done: Boolean(task.done),
    createdAt: task.createdAt || new Date().toISOString(),
    subtasks: normalizeSubtasks(task.subtasks)
  };
}

function getAllTasks() {
  const store = readStore();
  return store.tasks;
}

function saveTasks(tasks) {
  writeStore({ tasks });
}

function getTaskById(taskId) {
  const tasks = getAllTasks();
  const taskIndex = tasks.findIndex((task) => task.id === taskId);
  return { tasks, taskIndex };
}

app.get('/api/tasks', (_req, res) => {
  res.json({ tasks: getAllTasks() });
});

app.post('/api/tasks', (req, res) => {
  const nextTask = normalizeTask(req.body ?? {});

  if (!nextTask) {
    res.status(400).json({ error: 'Task title is required.' });
    return;
  }

  const tasks = getAllTasks();
  tasks.unshift(nextTask);
  saveTasks(tasks);
  res.status(201).json({ task: nextTask });
});

app.put('/api/tasks/:taskId', (req, res) => {
  const tasks = getAllTasks();
  const taskIndex = tasks.findIndex((task) => task.id === req.params.taskId);

  if (taskIndex === -1) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }

  const currentTask = tasks[taskIndex];
  const updatedTask = normalizeTask({
    ...currentTask,
    ...req.body,
    id: currentTask.id,
    createdAt: currentTask.createdAt
  });

  if (!updatedTask) {
    res.status(400).json({ error: 'Task title is required.' });
    return;
  }

  tasks[taskIndex] = updatedTask;
  saveTasks(tasks);
  res.json({ task: updatedTask });
});

app.delete('/api/tasks/:taskId', (req, res) => {
  const tasks = getAllTasks();
  const nextTasks = tasks.filter((task) => task.id !== req.params.taskId);

  if (nextTasks.length === tasks.length) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }

  saveTasks(nextTasks);
  res.status(204).end();
});

app.get('/api/export', (_req, res) => {
  res.json(readStore());
});

app.post('/api/import', (req, res) => {
  const nextStore = normalizeStore(req.body ?? {});
  writeStore(nextStore);
  res.json(nextStore);
});

app.post('/api/tasks/:taskId/subtasks', (req, res) => {
  const tasks = getAllTasks();
  const taskIndex = tasks.findIndex((task) => task.id === req.params.taskId);

  if (taskIndex === -1) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }

  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (!title) {
    res.status(400).json({ error: 'Subtask title is required.' });
    return;
  }

  const subtask = {
    id: randomUUID(),
    title,
    done: false
  };

  tasks[taskIndex].subtasks = [...normalizeSubtasks(tasks[taskIndex].subtasks), subtask];
  saveTasks(tasks);
  res.status(201).json({ subtask });
});

app.put('/api/tasks/:taskId/subtasks/reorder', (req, res) => {
  const { tasks, taskIndex } = getTaskById(req.params.taskId);

  if (taskIndex === -1) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }

  const subtaskIds = Array.isArray(req.body?.subtaskIds) ? req.body.subtaskIds : [];
  const subtasks = normalizeSubtasks(tasks[taskIndex].subtasks);

  if (subtaskIds.length !== subtasks.length) {
    res.status(400).json({ error: 'Subtask order is invalid.' });
    return;
  }

  const subtaskMap = new Map(subtasks.map((subtask) => [subtask.id, subtask]));
  const reorderedSubtasks = subtaskIds.map((subtaskId) => subtaskMap.get(subtaskId)).filter(Boolean);

  if (reorderedSubtasks.length !== subtasks.length) {
    res.status(400).json({ error: 'Subtask order is invalid.' });
    return;
  }

  tasks[taskIndex].subtasks = reorderedSubtasks;
  saveTasks(tasks);
  res.json({ subtasks: reorderedSubtasks });
});

app.put('/api/tasks/:taskId/subtasks/:subtaskId', (req, res) => {
  const { tasks, taskIndex } = getTaskById(req.params.taskId);

  if (taskIndex === -1) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }

  const subtasks = normalizeSubtasks(tasks[taskIndex].subtasks);
  const subtaskIndex = subtasks.findIndex((subtask) => subtask.id === req.params.subtaskId);

  if (subtaskIndex === -1) {
    res.status(404).json({ error: 'Subtask not found.' });
    return;
  }

  subtasks[subtaskIndex] = {
    ...subtasks[subtaskIndex],
    ...(typeof req.body?.title === 'string' ? { title: req.body.title.trim() || subtasks[subtaskIndex].title } : {}),
    ...(typeof req.body?.done === 'boolean' ? { done: req.body.done } : {})
  };

  tasks[taskIndex].subtasks = subtasks;
  saveTasks(tasks);
  res.json({ subtask: subtasks[subtaskIndex] });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.listen(port, () => {
  console.log(`ToDoListTool is running at http://localhost:${port}`);
});
