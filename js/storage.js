/**
 * Persistent Storage Manager
 * - IndexedDB for storing uploaded .epub files locally in the browser
 * - localStorage for vocabulary notebook, user preferences, and reading progress
 */
(function (global) {
  const DB_NAME = 'contextread_db';
  const DB_VERSION = 1;
  const BOOKS_STORE = 'epub_books';

  const VOCAB_KEY = 'contextread_vocab_v1';
  const SETTINGS_KEY = 'contextread_settings_v1';
  const PROGRESS_KEY = 'contextread_progress_v1';

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB desteklenmiyor'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(BOOKS_STORE)) {
          db.createObjectStore(BOOKS_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveBookToLibrary({ id, title, author, fileName, buffer }) {
    try {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(BOOKS_STORE, 'readwrite');
        const store = tx.objectStore(BOOKS_STORE);
        store.put({
          id,
          title,
          author,
          fileName,
          buffer,
          addedAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('IndexedDB kitap kaydı başarısız:', err);
    }
  }

  async function getSavedBooksMeta() {
    try {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(BOOKS_STORE, 'readonly');
        const store = tx.objectStore(BOOKS_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = (req.result || []).map(({ id, title, author, fileName, addedAt }) => ({
            id,
            title,
            author,
            fileName,
            addedAt,
          }));
          list.sort((a, b) => b.addedAt - a.addedAt);
          resolve(list);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  async function getSavedBookById(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BOOKS_STORE, 'readonly');
      const store = tx.objectStore(BOOKS_STORE);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteSavedBookById(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BOOKS_STORE, 'readwrite');
      const store = tx.objectStore(BOOKS_STORE);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function getSavedVocab() {
    try {
      const raw = localStorage.getItem(VOCAB_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveVocabItem(item) {
    const list = getSavedVocab();
    const existingIdx = list.findIndex(
      (v) =>
        v.word.toLowerCase() === item.word.toLowerCase() &&
        v.sentence === item.sentence
    );

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      word: item.word,
      baseForm: item.baseForm || item.word.toLowerCase(),
      contextualMeaning: item.contextualMeaning,
      sentence: item.sentence,
      sentenceTranslation: item.sentenceTranslation,
      grammarNote: item.grammarNote || '',
      bookTitle: item.bookTitle || '',
      savedAt: Date.now(),
    };

    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...entry };
    } else {
      list.unshift(entry);
    }

    localStorage.setItem(VOCAB_KEY, JSON.stringify(list));
    return list;
  }

  function removeVocabItem(id) {
    const list = getSavedVocab().filter((v) => v.id !== id);
    localStorage.setItem(VOCAB_KEY, JSON.stringify(list));
    return list;
  }

  function getSettings() {
    const defaults = {
      theme: 'paper',
      fontSizeRem: 1.15,
      fontFamily: "'Literata', Georgia, serif",
      speechRate: 0.9,
      geminiApiKey: '',
      tipDismissed: false,
    };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
    } catch {
      return defaults;
    }
  }

  function saveSettings(partial) {
    const next = { ...getSettings(), ...partial };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  function getBookProgress(bookId) {
    try {
      const map = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
      return map[bookId] || { chapterIndex: 0 };
    } catch {
      return { chapterIndex: 0 };
    }
  }

  function saveBookProgress(bookId, chapterIndex) {
    try {
      const map = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
      map[bookId] = { chapterIndex, updatedAt: Date.now() };
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
    } catch {
      // Ignore
    }
  }

  global.ContextReadStorage = {
    saveBookToLibrary,
    getSavedBooksMeta,
    getSavedBookById,
    deleteSavedBookById,
    getSavedVocab,
    saveVocabItem,
    removeVocabItem,
    getSettings,
    saveSettings,
    getBookProgress,
    saveBookProgress,
  };
})(window);
