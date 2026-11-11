export function normalizeNotebook(saved, legacy, now = new Date().toISOString()) {
  const savedNotes = Array.isArray(saved?.notes)
    ? saved.notes.filter((note) => note && typeof note.id === 'string' && note.id && typeof note.text === 'string')
      .map((note, index) => ({
        id: note.id,
        title: typeof note.title === 'string' ? note.title : 'פתק ' + (index + 1),
        phone: typeof note.phone === 'string' ? note.phone : '',
        text: note.text,
        createdAt: typeof note.createdAt === 'string' ? note.createdAt : now,
        pinned: note.pinned === true,
      }))
    : [];
  if (savedNotes.length) {
    return {
      notes: savedNotes,
      activeId: savedNotes.some((note) => note.id === saved.activeId) ? saved.activeId : savedNotes[0].id,
    };
  }

  const legacyEntries = typeof legacy === 'string'
    ? [['notes', legacy]]
    : legacy && typeof legacy === 'object' && !Array.isArray(legacy)
      ? Object.entries(legacy).filter(([, text]) => typeof text === 'string')
      : [];
  const migrated = legacyEntries
    .filter(([, text]) => text.trim().length > 0)
    .map(([id, text], index) => ({
      id: 'legacy:' + id,
      title: 'פתק ' + (index + 1),
      phone: '',
      text,
      createdAt: now,
    }));
  const notes = migrated.length ? migrated : [{
    id: 'note:initial', title: 'פתק 1', phone: '', text: '', createdAt: now,
  }];
  return { notes, activeId: notes[0].id };
}

export function singleNotebookWidgets(ids) {
  const seen = new Set();
  return ids.map((id) => id.startsWith('notes:') ? 'notes' : id)
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

/** Close a particular tab while preserving the other notes and current selection. */
export function closeNotebookTab(notebook, noteId, blankReplacement) {
  const closedIndex = notebook.notes.findIndex((note) => note.id === noteId);
  if (closedIndex === -1) return notebook;
  const remaining = notebook.notes.filter((note) => note.id !== noteId);
  if (remaining.length === 0) {
    return { notes: [blankReplacement], activeId: blankReplacement.id };
  }
  return {
    notes: remaining,
    activeId: notebook.activeId === noteId
      ? remaining[Math.min(closedIndex, remaining.length - 1)].id
      : notebook.activeId,
  };
}

export function sortNotebookTabs(notes) {
  return [...notes].sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true));
}
export function duplicateNotebookTab(notebook, noteId, newId, now) {
  const index = notebook.notes.findIndex((note) => note.id === noteId);
  if (index < 0) return notebook;
  const original = notebook.notes[index];
  const duplicate = {
    ...original, id: newId, title: original.title + ' (עותק)',
    pinned: false, createdAt: now,
  };
  const notes = [...notebook.notes];
  notes.splice(index + 1, 0, duplicate);
  return { notes, activeId: duplicate.id };
}
export function restoreClosedNotebookTab(notebook, deleted) {
  if (!deleted?.note || notebook.notes.some((note) => note.id === deleted.note.id)) return notebook;
  const notes = [...notebook.notes];
  // Closing the very last tab creates a blank tab; undo removes it if untouched.
  if (deleted.blankId && notes.length === 1 && notes[0].id === deleted.blankId
      && !notes[0].text && !notes[0].phone && notes[0].title === 'פתק 1') notes.length = 0;
  notes.splice(Math.min(Math.max(0, deleted.index), notes.length), 0, deleted.note);
  return { notes, activeId: deleted.note.id };
}
