const taskForm = document.querySelector('#task-form');
const taskListActive = document.querySelector('#task-list-active');
const taskListCompleted = document.querySelector('#task-list-completed');
const emptyStateActive = document.querySelector('#empty-state-active');
const emptyStateCompleted = document.querySelector('#empty-state-completed');
const stats = document.querySelector('#stats');
const taskTemplate = document.querySelector('#task-template');
const subtaskTemplate = document.querySelector('#subtask-template');
const filterQuery = document.querySelector('#filter-query');
const filterStatus = document.querySelector('#filter-status');
const filterPriority = document.querySelector('#filter-priority');
const clearFiltersButton = document.querySelector('#clear-filters');
const exportButton = document.querySelector('#export-json');
const importButton = document.querySelector('#import-json');
const importFileInput = document.querySelector('#import-file');

let tasks = [];
const filters = {
  query: '',
  status: 'all',
  priority: 'all'
};
let draggedSubtask = null;

function normalizeSearchValue(value) {
  return String(value ?? '').trim().toLowerCase();
}

function formatDate(value) {
  if (!value) {
    return 'Kein Fälligkeitsdatum';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

function formatDateForInput(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
}

function buildTaskSummary(task) {
  const subtaskCount = task.subtasks?.length ?? 0;
  const doneSubtasks = task.subtasks?.filter((subtask) => subtask.done).length ?? 0;
  return [
    `Fällig: ${formatDate(task.dueDate)}`,
    `Priorität: ${task.priority}`,
    `Status: ${task.status}`,
    `${doneSubtasks}/${subtaskCount} Subtasks erledigt`
  ].join(' · ');
}

function matchesFilters(task) {
  const query = normalizeSearchValue(filters.query);
  const searchableText = [
    task.title,
    task.description,
    task.priority,
    task.status,
    ...(task.subtasks ?? []).map((subtask) => subtask.title)
  ]
    .map(normalizeSearchValue)
    .join(' ');

  const queryMatches = !query || searchableText.includes(query);
  const statusMatches = filters.status === 'all' || task.status === filters.status;
  const priorityMatches = filters.priority === 'all' || task.priority === filters.priority;

  return queryMatches && statusMatches && priorityMatches;
}

function getVisibleTasks() {
  return tasks.filter(matchesFilters);
}

function renderStats() {
  const dueSoon = tasks.filter((task) => task.dueDate && new Date(task.dueDate) <= new Date()).length;
  const done = tasks.filter((task) => task.status === 'done').length;
  const open = tasks.length - done;

  stats.innerHTML = [
    { value: tasks.length, label: 'Tasks insgesamt' },
    { value: open, label: 'Offen' },
    { value: done, label: 'Erledigt' },
    { value: dueSoon, label: 'Heute fällig oder überfällig' }
  ]
    .map((entry) => `
      <div class="stat">
        <strong>${entry.value}</strong>
        <span>${entry.label}</span>
      </div>
    `)
    .join('');
}

async function persistSubtaskOrder(taskId, subtaskList) {
  const subtaskIds = Array.from(subtaskList.querySelectorAll('.subtask-item')).map((item) => item.dataset.subtaskId);

  await fetch(`/api/tasks/${taskId}/subtasks/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subtaskIds })
  });

  await loadTasks();
}

function attachSubtaskDragHandlers(subtaskItem, taskId, subtaskList) {
  subtaskItem.addEventListener('dragstart', (event) => {
    draggedSubtask = { taskId, subtaskId: subtaskItem.dataset.subtaskId };
    subtaskItem.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', subtaskItem.dataset.subtaskId);
  });

  subtaskItem.addEventListener('dragend', () => {
    draggedSubtask = null;
    subtaskItem.classList.remove('dragging');
    subtaskList.querySelectorAll('.drag-over').forEach((node) => node.classList.remove('drag-over'));
  });

  subtaskItem.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (draggedSubtask?.taskId === taskId && draggedSubtask.subtaskId !== subtaskItem.dataset.subtaskId) {
      subtaskItem.classList.add('drag-over');
    }
  });

  subtaskItem.addEventListener('dragleave', () => {
    subtaskItem.classList.remove('drag-over');
  });

  subtaskItem.addEventListener('drop', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!draggedSubtask || draggedSubtask.taskId !== taskId || draggedSubtask.subtaskId === subtaskItem.dataset.subtaskId) {
      return;
    }

    const draggedElement = subtaskList.querySelector(`[data-subtask-id="${draggedSubtask.subtaskId}"]`);
    if (!draggedElement) {
      return;
    }

    subtaskList.insertBefore(draggedElement, subtaskItem);
    await persistSubtaskOrder(taskId, subtaskList);
  });
}

function attachSubtaskListDropZone(subtaskList, taskId) {
  subtaskList.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  subtaskList.addEventListener('drop', async (event) => {
    event.preventDefault();

    if (!draggedSubtask || draggedSubtask.taskId !== taskId) {
      return;
    }

    const draggedElement = subtaskList.querySelector(`[data-subtask-id="${draggedSubtask.subtaskId}"]`);
    if (!draggedElement) {
      return;
    }

    subtaskList.appendChild(draggedElement);
    await persistSubtaskOrder(taskId, subtaskList);
  });
}

function renderTasksToContainer(containerList, emptyStateElement, tasksToRender) {
  containerList.innerHTML = '';
  emptyStateElement.classList.toggle('hidden', tasksToRender.length !== 0);

  tasksToRender.forEach((task) => {
    const taskNode = taskTemplate.content.cloneNode(true);
    const article = taskNode.querySelector('.task-item');
    const title = taskNode.querySelector('.task-title');
    const meta = taskNode.querySelector('.task-meta');
    const description = taskNode.querySelector('.task-description');
    const editButton = taskNode.querySelector('.edit-task');
    const toggleButton = taskNode.querySelector('.toggle-task');
    const deleteButton = taskNode.querySelector('.delete-task');
    const editForm = taskNode.querySelector('.task-edit-form');
    const editTitle = taskNode.querySelector('input[name="title"]');
    const editDueDate = taskNode.querySelector('input[name="dueDate"]');
    const editDescription = taskNode.querySelector('textarea[name="description"]');
    const editPriority = taskNode.querySelector('select[name="priority"]');
    const editStatus = taskNode.querySelector('select[name="status"]');
    const cancelEditButton = taskNode.querySelector('.cancel-edit');
    const addSubtaskTrigger = taskNode.querySelector('.add-subtask-trigger');
    const subtaskForm = taskNode.querySelector('.subtask-form');
    const subtaskInput = taskNode.querySelector('input[name="subtaskTitle"]');
    const subtaskList = taskNode.querySelector('.subtask-list');

    title.textContent = task.title;
    meta.textContent = buildTaskSummary(task);
    description.textContent = task.description || 'Keine Beschreibung hinterlegt.';
    toggleButton.textContent = task.status === 'done' ? 'Als offen markieren' : 'Als erledigt markieren';
    article.classList.toggle('completed', task.status === 'done');

    editTitle.value = task.title;
    editDueDate.value = formatDateForInput(task.dueDate);
    editDescription.value = task.description || '';
    editPriority.value = task.priority;
    editStatus.value = task.status;

    toggleButton.addEventListener('click', async () => {
      await updateTask(task.id, {
        status: task.status === 'done' ? 'todo' : 'done',
        done: task.status !== 'done'
      });
    });

    editButton.addEventListener('click', () => {
      editForm.classList.toggle('hidden');
      if (!editForm.classList.contains('hidden')) {
        editTitle.focus();
      }
    });

    cancelEditButton.addEventListener('click', () => {
      editForm.classList.add('hidden');
      editTitle.value = task.title;
      editDueDate.value = formatDateForInput(task.dueDate);
      editDescription.value = task.description || '';
      editPriority.value = task.priority;
      editStatus.value = task.status;
    });

    editForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      await updateTask(task.id, {
        title: editTitle.value,
        dueDate: editDueDate.value,
        description: editDescription.value,
        priority: editPriority.value,
        status: editStatus.value,
        done: editStatus.value === 'done'
      });

      editForm.classList.add('hidden');
    });

    deleteButton.addEventListener('click', async () => {
      await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      await loadTasks();
    });

    addSubtaskTrigger.addEventListener('click', () => {
      subtaskForm.classList.toggle('hidden');
      if (!subtaskForm.classList.contains('hidden')) {
        subtaskInput.focus();
      }
    });

    subtaskForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(subtaskForm);
      const title = String(formData.get('subtaskTitle') ?? '').trim();
      if (!title) {
        return;
      }

      await fetch(`/api/tasks/${task.id}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });

      subtaskForm.reset();
      subtaskForm.classList.add('hidden');
      await loadTasks();
    });

    (task.subtasks ?? []).forEach((subtask) => {
      const subtaskNode = subtaskTemplate.content.cloneNode(true);
      const item = subtaskNode.querySelector('.subtask-item');
      const checkbox = subtaskNode.querySelector('.subtask-toggle');
      const name = subtaskNode.querySelector('.subtask-name');
      const deleteSubtaskButton = subtaskNode.querySelector('.delete-subtask');

      item.dataset.subtaskId = subtask.id;
      attachSubtaskDragHandlers(item, task.id, subtaskList);
      item.classList.toggle('completed', subtask.done);
      checkbox.checked = subtask.done;
      name.textContent = subtask.title;

      checkbox.addEventListener('change', async () => {
        await fetch(`/api/tasks/${task.id}/subtasks/${subtask.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ done: checkbox.checked })
        });
        await loadTasks();
      });

      deleteSubtaskButton.addEventListener('click', async () => {
        await fetch(`/api/tasks/${task.id}/subtasks/${subtask.id}`, { method: 'DELETE' });
        await loadTasks();
      });

      subtaskList.appendChild(subtaskNode);
    });

    attachSubtaskListDropZone(subtaskList, task.id);

    containerList.appendChild(taskNode);
  });
}

function renderTasks() {
  const visibleTasks = getVisibleTasks();
  const activeTasks = visibleTasks.filter((task) => task.status !== 'done');
  const completedTasks = visibleTasks.filter((task) => task.status === 'done');

  renderTasksToContainer(taskListActive, emptyStateActive, activeTasks);
  renderTasksToContainer(taskListCompleted, emptyStateCompleted, completedTasks);

  renderStats();
}

async function updateTask(taskId, payload) {
  await fetch(`/api/tasks/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadTasks();
}

async function exportTasks() {
  const response = await fetch('/api/export');
  const store = await response.json();
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'todolisttool-export.json';
  link.click();
  URL.revokeObjectURL(url);
}

async function importTasksFromFile(file) {
  const rawText = await file.text();
  const parsed = JSON.parse(rawText);
  const payload = Array.isArray(parsed) ? { tasks: parsed } : parsed;

  await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  await loadTasks();
}

async function loadTasks() {
  const response = await fetch('/api/tasks');
  const data = await response.json();
  tasks = Array.isArray(data.tasks) ? data.tasks : [];
  renderTasks();
}

filterQuery.addEventListener('input', () => {
  filters.query = filterQuery.value;
  renderTasks();
});

filterStatus.addEventListener('change', () => {
  filters.status = filterStatus.value;
  renderTasks();
});

filterPriority.addEventListener('change', () => {
  filters.priority = filterPriority.value;
  renderTasks();
});

clearFiltersButton.addEventListener('click', () => {
  filters.query = '';
  filters.status = 'all';
  filters.priority = 'all';
  filterQuery.value = '';
  filterStatus.value = 'all';
  filterPriority.value = 'all';
  renderTasks();
});

exportButton.addEventListener('click', async () => {
  await exportTasks();
});

importButton.addEventListener('click', () => {
  importFileInput.click();
});

importFileInput.addEventListener('change', async () => {
  const [file] = importFileInput.files ?? [];
  if (!file) {
    return;
  }

  const confirmed = window.confirm('Diese JSON-Datei ersetzt alle aktuellen Tasks. Fortfahren?');
  if (!confirmed) {
    importFileInput.value = '';
    return;
  }

  try {
    await importTasksFromFile(file);
  } catch {
    window.alert('Die JSON-Datei konnte nicht importiert werden.');
  }

  importFileInput.value = '';
});

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(taskForm);
  const subtasks = String(formData.get('subtasks') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((title) => ({ title }));

  await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: formData.get('title'),
      description: formData.get('description'),
      dueDate: formData.get('dueDate'),
      priority: formData.get('priority'),
      status: formData.get('status'),
      subtasks
    })
  });

  taskForm.reset();
  taskForm.querySelector('select[name="priority"]').value = 'medium';
  taskForm.querySelector('select[name="status"]').value = 'todo';
  await loadTasks();
});

loadTasks();
