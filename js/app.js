(function () {
  const {
    parseEpubBuffer,
    makeContainerInteractive,
    getSampleBook,
  } = window.ContextReadEpub;
  const { analyzeWordInContext } = window.ContextReadEngine;
  const {
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
  } = window.ContextReadStorage;

  const state = {
    currentBook: null,
    currentChapterIndex: 0,
    activeWordData: null,
    settings: getSettings(),
    vocab: getSavedVocab(),
    flashcardIndex: 0,
    isFlashcardMode: false,
  };

  const els = {
    workspace: document.getElementById('workspace'),
    sidebar: document.getElementById('sidebar'),
    sidebarBackdrop: document.getElementById('sidebarBackdrop'),
    closeSidebarMobileBtn: document.getElementById('closeSidebarMobileBtn'),
    toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
    sidebarTabs: document.querySelectorAll('.sidebar-tab'),
    tocPanel: document.getElementById('tocPanel'),
    libraryPanel: document.getElementById('libraryPanel'),
    bookMetaCard: document.getElementById('bookMetaCard'),
    metaTitle: document.getElementById('metaTitle'),
    metaAuthor: document.getElementById('metaAuthor'),
    tocList: document.getElementById('tocList'),
    userLibraryList: document.getElementById('userLibraryList'),
    sampleBookCards: document.querySelectorAll('.sample-book-card'),

    currentBookTitle: document.getElementById('currentBookTitle'),
    chapterNav: document.getElementById('chapterNav'),
    prevChapterBtn: document.getElementById('prevChapterBtn'),
    nextChapterBtn: document.getElementById('nextChapterBtn'),
    chapterIndicator: document.getElementById('chapterIndicator'),

    epubFileInput: document.getElementById('epubFileInput'),
    fontDecreaseBtn: document.getElementById('fontDecreaseBtn'),
    fontIncreaseBtn: document.getElementById('fontIncreaseBtn'),
    modalFontDecBtn: document.getElementById('modalFontDecBtn'),
    modalFontIncBtn: document.getElementById('modalFontIncBtn'),
    themeDots: document.querySelectorAll('.theme-dot'),
    themeChoiceBtns: document.querySelectorAll('.theme-choice-btn'),
    metaThemeColor: document.getElementById('metaThemeColor'),

    readerContainer: document.getElementById('readerContainer'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    dropzone: document.getElementById('dropzone'),
    trySampleBtn: document.getElementById('trySampleBtn'),
    bookSurface: document.getElementById('bookSurface'),
    readingTipBanner: document.getElementById('readingTipBanner'),
    dismissTipBtn: document.getElementById('dismissTipBtn'),
    chapterContent: document.getElementById('chapterContent'),
    footerPrevBtn: document.getElementById('footerPrevBtn'),
    footerNextBtn: document.getElementById('footerNextBtn'),
    footerChapterInfo: document.getElementById('footerChapterInfo'),

    contextPanel: document.getElementById('contextPanel'),
    sheetDragHandle: document.getElementById('sheetDragHandle'),
    closeContextSheetBtn: document.getElementById('closeContextSheetBtn'),
    activeEngineBadge: document.getElementById('activeEngineBadge'),
    contextEmptyState: document.getElementById('contextEmptyState'),
    contextResultCard: document.getElementById('contextResultCard'),
    selectedWordText: document.getElementById('selectedWordText'),
    selectedWordPhonetic: document.getElementById('selectedWordPhonetic'),
    selectedWordPos: document.getElementById('selectedWordPos'),
    selectedWordLemma: document.getElementById('selectedWordLemma'),
    speakWordBtn: document.getElementById('speakWordBtn'),
    saveWordBtn: document.getElementById('saveWordBtn'),
    contextualMeaningText: document.getElementById('contextualMeaningText'),
    grammarNoteText: document.getElementById('grammarNoteText'),
    originalSentenceHtml: document.getElementById('originalSentenceHtml'),
    translatedSentenceText: document.getElementById('translatedSentenceText'),
    speakSentenceBtn: document.getElementById('speakSentenceBtn'),
    dictionaryDetailsCard: document.getElementById('dictionaryDetailsCard'),
    otherMeaningsList: document.getElementById('otherMeaningsList'),

    openVocabModalBtn: document.getElementById('openVocabModalBtn'),
    vocabCountBadge: document.getElementById('vocabCountBadge'),
    vocabDialog: document.getElementById('vocabDialog'),
    closeVocabDialogBtn: document.getElementById('closeVocabDialogBtn'),
    toggleFlashcardModeBtn: document.getElementById('toggleFlashcardModeBtn'),
    exportVocabBtn: document.getElementById('exportVocabBtn'),
    vocabListView: document.getElementById('vocabListView'),
    vocabListContainer: document.getElementById('vocabListContainer'),
    flashcardStudyView: document.getElementById('flashcardStudyView'),
    flashcardCounter: document.getElementById('flashcardCounter'),
    fcWord: document.getElementById('fcWord'),
    fcSentence: document.getElementById('fcSentence'),
    flipCardBtn: document.getElementById('flipCardBtn'),
    fcBack: document.getElementById('fcBack'),
    fcMeaning: document.getElementById('fcMeaning'),
    fcTranslation: document.getElementById('fcTranslation'),
    fcNote: document.getElementById('fcNote'),
    prevCardBtn: document.getElementById('prevCardBtn'),
    nextCardBtn: document.getElementById('nextCardBtn'),
    speakCardWordBtn: document.getElementById('speakCardWordBtn'),

    openSettingsModalBtn: document.getElementById('openSettingsModalBtn'),
    settingsDialog: document.getElementById('settingsDialog'),
    closeSettingsDialogBtn: document.getElementById('closeSettingsDialogBtn'),
    geminiApiKeyInput: document.getElementById('geminiApiKeyInput'),
    toggleKeyVisibilityBtn: document.getElementById('toggleKeyVisibilityBtn'),
    fontFamilySelect: document.getElementById('fontFamilySelect'),
    speechRateSelect: document.getElementById('speechRateSelect'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  };

  function isMobileViewport() {
    return window.matchMedia('(max-width: 860px)').matches;
  }

  function openMobileSidebar() {
    els.sidebar.classList.add('mobile-open');
    els.sidebarBackdrop.hidden = false;
  }

  function closeMobileSidebar() {
    els.sidebar.classList.remove('mobile-open');
    els.sidebarBackdrop.hidden = true;
  }

  function openContextSheet() {
    els.contextPanel.classList.add('sheet-open');
  }

  function closeContextSheet() {
    els.contextPanel.classList.remove('sheet-open');
    els.chapterContent
      .querySelectorAll('.ctx-word.active-word')
      .forEach((el) => el.classList.remove('active-word'));
    els.chapterContent
      .querySelectorAll('.ctx-sentence.active-sentence')
      .forEach((el) => el.classList.remove('active-sentence'));
  }

  async function init() {
    applyAppearanceSettings();
    updateVocabBadge();
    updateEngineBadge();
    bindEvents();
    await renderUserLibrary();
  }

  function applyAppearanceSettings() {
    const { theme, fontSizeRem, fontFamily, tipDismissed } = state.settings;
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--reader-font-size', `${fontSizeRem}rem`);
    document.documentElement.style.setProperty('--reader-font', fontFamily);

    const themeColors = { paper: '#fbf9f5', sepia: '#f4ecd8', dark: '#161d27' };
    if (els.metaThemeColor) {
      els.metaThemeColor.setAttribute('content', themeColors[theme] || '#fbf9f5');
    }

    els.themeDots.forEach((dot) => {
      dot.classList.toggle('active', dot.dataset.themeVal === theme);
    });
    els.themeChoiceBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeVal === theme);
    });

    if (tipDismissed && els.readingTipBanner) {
      els.readingTipBanner.hidden = true;
    }
  }

  function updateEngineBadge() {
    const hasKey = Boolean(state.settings.geminiApiKey?.trim());
    els.activeEngineBadge.textContent = hasKey ? '✨ Gemini 3.8 AI' : '⚡ Hızlı Bağlam';
  }

  function updateVocabBadge() {
    state.vocab = getSavedVocab();
    els.vocabCountBadge.textContent = String(state.vocab.length);
  }

  function adjustFontSize(delta) {
    const nextSize = Math.min(1.65, Math.max(0.9, +(state.settings.fontSizeRem + delta).toFixed(2)));
    state.settings = saveSettings({ fontSizeRem: nextSize });
    applyAppearanceSettings();
  }

  function bindEvents() {
    // Sidebar Toggle (Drawer on Mobile, Column Collapse on Desktop)
    els.toggleSidebarBtn.addEventListener('click', () => {
      if (isMobileViewport()) {
        if (els.sidebar.classList.contains('mobile-open')) {
          closeMobileSidebar();
        } else {
          openMobileSidebar();
        }
      } else {
        els.workspace.classList.toggle('sidebar-collapsed');
      }
    });

    els.closeSidebarMobileBtn?.addEventListener('click', closeMobileSidebar);
    els.sidebarBackdrop?.addEventListener('click', closeMobileSidebar);

    els.sidebarTabs.forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        els.sidebarTabs.forEach((b) => b.classList.remove('active'));
        tabBtn.classList.add('active');
        const tab = tabBtn.dataset.tab;
        els.tocPanel.hidden = tab !== 'toc';
        els.libraryPanel.hidden = tab !== 'library';
      });
    });

    els.trySampleBtn.addEventListener('click', () => {
      loadBookObject(getSampleBook('beginner'));
    });

    els.sampleBookCards.forEach((card) => {
      card.addEventListener('click', () => {
        const sampleKey = card.dataset.sample;
        loadBookObject(getSampleBook(sampleKey));
        closeMobileSidebar();
      });
    });

    els.epubFileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        await handleEpubFileUpload(file);
        e.target.value = '';
      }
    });

    ['dragenter', 'dragover'].forEach((evt) => {
      els.readerContainer.addEventListener(evt, (e) => {
        e.preventDefault();
        els.dropzone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach((evt) => {
      els.readerContainer.addEventListener(evt, (e) => {
        e.preventDefault();
        els.dropzone.classList.remove('drag-over');
      });
    });

    els.readerContainer.addEventListener('drop', async (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        await handleEpubFileUpload(file);
      }
    });

    els.prevChapterBtn.addEventListener('click', () => navigateChapter(-1));
    els.nextChapterBtn.addEventListener('click', () => navigateChapter(1));
    els.footerPrevBtn.addEventListener('click', () => navigateChapter(-1));
    els.footerNextBtn.addEventListener('click', () => navigateChapter(1));

    els.fontDecreaseBtn.addEventListener('click', () => adjustFontSize(-0.1));
    els.fontIncreaseBtn.addEventListener('click', () => adjustFontSize(0.1));
    els.modalFontDecBtn?.addEventListener('click', () => adjustFontSize(-0.1));
    els.modalFontIncBtn?.addEventListener('click', () => adjustFontSize(0.1));

    [...els.themeDots, ...els.themeChoiceBtns].forEach((btn) => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.themeVal;
        state.settings = saveSettings({ theme });
        applyAppearanceSettings();
      });
    });

    els.dismissTipBtn.addEventListener('click', () => {
      els.readingTipBanner.hidden = true;
      state.settings = saveSettings({ tipDismissed: true });
    });

    // Touch & Pointer Prefetching: starts translation ~80ms before finger tap finishes!
    els.chapterContent.addEventListener('pointerdown', handleTouchPointerPrefetch, { passive: true });
    els.chapterContent.addEventListener('mouseover', handleWordHoverPrefetch, { passive: true });
    els.chapterContent.addEventListener('click', handleChapterContentClick);
    els.chapterContent.addEventListener('mouseup', handlePhraseSelection);

    // Mobile Bottom Sheet Close & Swipe-Down Support
    els.closeContextSheetBtn?.addEventListener('click', closeContextSheet);

    let touchStartY = 0;
    els.contextPanel.addEventListener(
      'touchstart',
      (e) => {
        if (els.contextPanel.scrollTop <= 0) {
          touchStartY = e.touches[0].clientY;
        } else {
          touchStartY = 0;
        }
      },
      { passive: true }
    );

    els.contextPanel.addEventListener(
      'touchend',
      (e) => {
        if (!touchStartY) return;
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        if (deltaY > 65 && els.contextPanel.scrollTop <= 0) {
          closeContextSheet();
        }
        touchStartY = 0;
      },
      { passive: true }
    );

    els.speakWordBtn.addEventListener('click', () => {
      if (!state.activeWordData) return;
      if (state.activeWordData.audioUrl) {
        const audio = new Audio(state.activeWordData.audioUrl);
        audio.play().catch(() => speakText(state.activeWordData.word));
      } else {
        speakText(state.activeWordData.word);
      }
    });

    els.speakSentenceBtn.addEventListener('click', () => {
      if (state.activeWordData?.sentence) {
        speakText(state.activeWordData.sentence);
      }
    });

    els.saveWordBtn.addEventListener('click', () => {
      if (!state.activeWordData) return;
      saveVocabItem({
        ...state.activeWordData,
        bookTitle: state.currentBook?.title || '',
      });
      updateVocabBadge();
      els.saveWordBtn.classList.add('saved');
      els.saveWordBtn.innerHTML = '<span>★ Kaydedildi</span>';

      const lowerTarget = state.activeWordData.word.toLowerCase();
      els.chapterContent.querySelectorAll('.ctx-word').forEach((span) => {
        if (span.dataset.word?.toLowerCase() === lowerTarget) {
          span.classList.add('saved-word');
        }
      });
    });

    els.openVocabModalBtn.addEventListener('click', () => {
      state.isFlashcardMode = false;
      renderVocabModal();
      els.vocabDialog.showModal();
    });

    els.closeVocabDialogBtn.addEventListener('click', () => els.vocabDialog.close());

    els.toggleFlashcardModeBtn.addEventListener('click', () => {
      state.isFlashcardMode = !state.isFlashcardMode;
      state.flashcardIndex = 0;
      renderVocabModal();
    });

    els.flipCardBtn.addEventListener('click', () => {
      els.fcBack.hidden = false;
    });

    els.prevCardBtn.addEventListener('click', () => {
      if (state.vocab.length === 0) return;
      state.flashcardIndex =
        (state.flashcardIndex - 1 + state.vocab.length) % state.vocab.length;
      renderFlashcard();
    });

    els.nextCardBtn.addEventListener('click', () => {
      if (state.vocab.length === 0) return;
      state.flashcardIndex = (state.flashcardIndex + 1) % state.vocab.length;
      renderFlashcard();
    });

    els.speakCardWordBtn.addEventListener('click', () => {
      const item = state.vocab[state.flashcardIndex];
      if (item) speakText(item.word);
    });

    els.exportVocabBtn.addEventListener('click', exportVocabularyCsv);

    els.openSettingsModalBtn.addEventListener('click', () => {
      els.geminiApiKeyInput.value = state.settings.geminiApiKey || '';
      els.fontFamilySelect.value = state.settings.fontFamily;
      els.speechRateSelect.value = String(state.settings.speechRate);
      els.settingsDialog.showModal();
    });

    els.closeSettingsDialogBtn.addEventListener('click', () => els.settingsDialog.close());

    els.toggleKeyVisibilityBtn.addEventListener('click', () => {
      const isPwd = els.geminiApiKeyInput.type === 'password';
      els.geminiApiKeyInput.type = isPwd ? 'text' : 'password';
      els.toggleKeyVisibilityBtn.textContent = isPwd ? 'Gizle' : 'Göster';
    });

    els.saveSettingsBtn.addEventListener('click', () => {
      state.settings = saveSettings({
        geminiApiKey: els.geminiApiKeyInput.value.trim(),
        fontFamily: els.fontFamilySelect.value,
        speechRate: parseFloat(els.speechRateSelect.value) || 0.9,
      });
      applyAppearanceSettings();
      updateEngineBadge();
      els.settingsDialog.close();
    });

    [els.vocabDialog, els.settingsDialog].forEach((dlg) => {
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) dlg.close();
      });
    });
  }

  async function handleEpubFileUpload(file) {
    try {
      els.currentBookTitle.textContent = 'EPUB dosyası ayrıştırılıyor...';
      const buffer = await file.arrayBuffer();
      const parsedBook = await parseEpubBuffer(buffer, file.name);
      const bookId = `book-${file.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${file.size}`;
      parsedBook.id = bookId;

      await saveBookToLibrary({
        id: bookId,
        title: parsedBook.title,
        author: parsedBook.author,
        fileName: file.name,
        buffer,
      });

      await renderUserLibrary();
      loadBookObject(parsedBook);
      closeMobileSidebar();
    } catch (err) {
      alert(`EPUB açılırken hata oluştu: ${err.message}`);
      els.currentBookTitle.textContent = 'Bağlam Odaklı EPUB Okuyucu';
    }
  }

  async function renderUserLibrary() {
    const books = await getSavedBooksMeta();
    els.userLibraryList.innerHTML = '';

    if (books.length === 0) {
      els.userLibraryList.innerHTML =
        '<li class="empty-hint">Henüz cihazınızdan EPUB yüklemediniz.</li>';
      return;
    }

    for (const b of books) {
      const li = document.createElement('li');
      li.className = 'library-book-item';
      li.innerHTML = `
        <div class="library-book-info">
          <strong>${escapeHtml(b.title)}</strong>
          <small>${escapeHtml(b.author)}</small>
        </div>
        <button class="delete-book-btn" title="Kitaplıktan Sil" data-del-id="${escapeHtml(b.id)}">🗑️</button>
      `;

      li.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('.delete-book-btn');
        if (delBtn) {
          e.stopPropagation();
          await deleteSavedBookById(b.id);
          await renderUserLibrary();
          return;
        }

        const record = await getSavedBookById(b.id);
        if (record?.buffer) {
          const parsed = await parseEpubBuffer(record.buffer, record.fileName);
          parsed.id = record.id;
          loadBookObject(parsed);
          closeMobileSidebar();
        }
      });

      els.userLibraryList.appendChild(li);
    }
  }

  function loadBookObject(book) {
    state.currentBook = book;
    const savedProgress = getBookProgress(book.id);
    const startChapter =
      savedProgress.chapterIndex < book.chapters.length ? savedProgress.chapterIndex : 0;

    els.welcomeScreen.hidden = true;
    els.bookSurface.hidden = false;
    els.chapterNav.hidden = false;
    els.bookMetaCard.hidden = false;

    els.currentBookTitle.textContent = `${book.title} — ${book.author}`;
    els.metaTitle.textContent = book.title;
    els.metaAuthor.textContent = book.author;

    els.sidebarTabs.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === 'toc');
    });
    els.tocPanel.hidden = false;
    els.libraryPanel.hidden = true;

    renderTocList();
    renderChapter(startChapter);
  }

  function renderTocList() {
    els.tocList.innerHTML = '';
    if (!state.currentBook) return;

    state.currentBook.chapters.forEach((ch, idx) => {
      const li = document.createElement('li');
      li.className = 'toc-item';
      if (idx === state.currentChapterIndex) li.classList.add('active');
      li.textContent = ch.title;
      li.addEventListener('click', () => {
        renderChapter(idx);
        closeMobileSidebar();
      });
      els.tocList.appendChild(li);
    });
  }

  function renderChapter(chapterIndex) {
    if (!state.currentBook) return;
    const chapters = state.currentBook.chapters;
    if (chapterIndex < 0 || chapterIndex >= chapters.length) return;

    state.currentChapterIndex = chapterIndex;
    saveBookProgress(state.currentBook.id, chapterIndex);
    closeContextSheet();

    const chapter = chapters[chapterIndex];
    els.chapterContent.innerHTML = chapter.html;

    const savedSet = new Set(getSavedVocab().map((v) => v.word.toLowerCase()));
    makeContainerInteractive(els.chapterContent, savedSet);

    const total = chapters.length;
    els.chapterIndicator.textContent = `${chapterIndex + 1} / ${total}`;
    els.footerChapterInfo.textContent = `${chapter.title} (${chapterIndex + 1}/${total})`;

    els.prevChapterBtn.disabled = chapterIndex === 0;
    els.footerPrevBtn.disabled = chapterIndex === 0;
    els.nextChapterBtn.disabled = chapterIndex === total - 1;
    els.footerNextBtn.disabled = chapterIndex === total - 1;

    Array.from(els.tocList.children).forEach((li, idx) => {
      li.classList.toggle('active', idx === chapterIndex);
    });

    els.readerContainer.scrollTop = 0;
  }

  function navigateChapter(delta) {
    if (!state.currentBook) return;
    renderChapter(state.currentChapterIndex + delta);
  }

  function handleTouchPointerPrefetch(e) {
    const wordSpan = e.target.closest('.ctx-word');
    if (!wordSpan) return;
    const sentenceSpan = wordSpan.closest('.ctx-sentence');
    const word = wordSpan.dataset.word || wordSpan.textContent.trim();
    const sentence = sentenceSpan?.dataset.sentence || word;
    analyzeWordInContext(word, sentence, '').catch(() => {});
  }

  let hoverTimer = null;
  function handleWordHoverPrefetch(e) {
    const wordSpan = e.target.closest('.ctx-word');
    if (!wordSpan) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      const sentenceSpan = wordSpan.closest('.ctx-sentence');
      const word = wordSpan.dataset.word || wordSpan.textContent.trim();
      const sentence = sentenceSpan?.dataset.sentence || word;
      analyzeWordInContext(word, sentence, '').catch(() => {});
    }, 65);
  }

  async function handleChapterContentClick(e) {
    const wordSpan = e.target.closest('.ctx-word');
    if (!wordSpan) {
      // Tapping empty space on mobile dismisses the bottom sheet
      if (isMobileViewport() && els.contextPanel.classList.contains('sheet-open')) {
        closeContextSheet();
      }
      return;
    }

    const selection = window.getSelection();
    if (selection && selection.toString().trim().includes(' ')) {
      return;
    }

    const sentenceSpan = wordSpan.closest('.ctx-sentence');
    const word = wordSpan.dataset.word || wordSpan.textContent.trim();
    const sentence =
      sentenceSpan?.dataset.sentence ||
      wordSpan.parentElement?.textContent?.replace(/\s+/g, ' ').trim() ||
      word;

    els.chapterContent
      .querySelectorAll('.ctx-word.active-word')
      .forEach((el) => el.classList.remove('active-word'));
    els.chapterContent
      .querySelectorAll('.ctx-sentence.active-sentence')
      .forEach((el) => el.classList.remove('active-sentence'));

    wordSpan.classList.add('active-word');
    if (sentenceSpan) {
      sentenceSpan.classList.add('active-sentence');
    }

    openContextSheet();
    await triggerContextualLookup(word, sentence);
  }

  async function handlePhraseSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const selectedText = selection.toString().replace(/\s+/g, ' ').trim();
    const wordCount = selectedText.split(' ').length;
    if (wordCount < 2 || wordCount > 6) return;

    const anchorEl =
      selection.anchorNode?.nodeType === 1
        ? selection.anchorNode
        : selection.anchorNode?.parentElement;
    const sentenceSpan = anchorEl?.closest?.('.ctx-sentence');
    if (!sentenceSpan) return;

    els.chapterContent
      .querySelectorAll('.ctx-sentence.active-sentence')
      .forEach((el) => el.classList.remove('active-sentence'));
    sentenceSpan.classList.add('active-sentence');

    const sentence = sentenceSpan.dataset.sentence || selectedText;
    openContextSheet();
    await triggerContextualLookup(selectedText, sentence);
  }

  let activeLookupId = 0;

  function renderAnalysisToUI(analysis, word) {
    state.activeWordData = analysis;

    els.contextualMeaningText.classList.remove('loading-pulse');
    els.translatedSentenceText.classList.remove('loading-pulse');

    els.contextualMeaningText.textContent = analysis.contextualMeaning;
    els.translatedSentenceText.textContent = analysis.sentenceTranslation;
    els.selectedWordPhonetic.textContent = analysis.phonetic || '';

    if (analysis.partOfSpeech) {
      els.selectedWordPos.textContent = analysis.partOfSpeech;
      els.selectedWordPos.hidden = false;
    } else {
      els.selectedWordPos.hidden = true;
    }

    if (
      analysis.baseForm &&
      analysis.baseForm.toLowerCase() !== word.toLowerCase()
    ) {
      els.selectedWordLemma.textContent = `Kök: ${analysis.baseForm}`;
      els.selectedWordLemma.hidden = false;
    } else {
      els.selectedWordLemma.hidden = true;
    }

    if (analysis.grammarNote) {
      els.grammarNoteText.textContent = `💡 ${analysis.grammarNote}`;
      els.grammarNoteText.hidden = false;
    } else {
      els.grammarNoteText.hidden = true;
    }

    if (analysis.otherMeanings && analysis.otherMeanings.length > 0) {
      els.otherMeaningsList.innerHTML = analysis.otherMeanings
        .map(
          (m) => `
          <div class="meaning-row">
            <strong>${escapeHtml(m.pos)}:</strong>
            <span>${escapeHtml(m.text)}</span>
          </div>
        `
        )
        .join('');
      els.dictionaryDetailsCard.hidden = false;
    } else {
      els.dictionaryDetailsCard.hidden = true;
    }
  }

  async function triggerContextualLookup(word, sentence) {
    const lookupId = ++activeLookupId;
    els.contextEmptyState.hidden = true;
    els.contextResultCard.hidden = false;
    els.contextPanel.scrollTop = 0;

    els.selectedWordText.textContent = word;
    els.selectedWordPhonetic.textContent = '';

    const isAlreadySaved = getSavedVocab().some(
      (v) => v.word.toLowerCase() === word.toLowerCase() && v.sentence === sentence
    );
    els.saveWordBtn.classList.toggle('saved', isAlreadySaved);
    els.saveWordBtn.innerHTML = isAlreadySaved
      ? '<span>★ Kaydedildi</span>'
      : '<span>☆ Kaydet</span>';

    els.originalSentenceHtml.innerHTML = highlightWordInSentenceHtml(sentence, word);

    const cached =
      window.ContextReadEngine.getCachedAnalysis &&
      window.ContextReadEngine.getCachedAnalysis(word, sentence, state.settings.geminiApiKey);
    if (cached) {
      renderAnalysisToUI(cached, word);
      return;
    }

    els.selectedWordPos.hidden = true;
    els.selectedWordLemma.hidden = true;
    els.grammarNoteText.hidden = true;
    els.dictionaryDetailsCard.hidden = true;
    els.contextualMeaningText.textContent = 'Analiz ediliyor...';
    els.contextualMeaningText.classList.add('loading-pulse');
    els.translatedSentenceText.textContent = 'Çevriliyor...';
    els.translatedSentenceText.classList.add('loading-pulse');

    try {
      const analysis = await analyzeWordInContext(
        word,
        sentence,
        state.settings.geminiApiKey,
        (fastPreview) => {
          if (lookupId === activeLookupId) {
            renderAnalysisToUI(fastPreview, word);
          }
        }
      );
      if (lookupId !== activeLookupId) return;
      renderAnalysisToUI(analysis, word);
    } catch (err) {
      if (lookupId !== activeLookupId) return;
      els.contextualMeaningText.classList.remove('loading-pulse');
      els.translatedSentenceText.classList.remove('loading-pulse');
      els.contextualMeaningText.textContent = 'Bağlam analizi alınamadı.';
      els.translatedSentenceText.textContent = err.message;
    }
  }

  function renderVocabModal() {
    state.vocab = getSavedVocab();
    updateVocabBadge();

    if (state.isFlashcardMode && state.vocab.length > 0) {
      els.vocabListView.hidden = true;
      els.flashcardStudyView.hidden = false;
      els.toggleFlashcardModeBtn.textContent = '📋 Liste';
      renderFlashcard();
      return;
    }

    state.isFlashcardMode = false;
    els.vocabListView.hidden = false;
    els.flashcardStudyView.hidden = true;
    els.toggleFlashcardModeBtn.textContent = '🎯 Kartlarla Test';

    if (state.vocab.length === 0) {
      els.vocabListContainer.innerHTML = `
        <div class="empty-hint">
          Henüz kelime kaydetmediniz. Kitap okurken bir kelimeye dokunup <strong>"☆ Kaydet"</strong> butonuna basarak cümlesiyle birlikte buraya ekleyebilirsiniz.
        </div>
      `;
      return;
    }

    els.vocabListContainer.innerHTML = state.vocab
      .map(
        (item) => `
        <div class="vocab-item-card">
          <div class="vocab-item-main">
            <div>
              <h4>${escapeHtml(item.word)}</h4>
              <span class="vocab-item-meaning">${escapeHtml(item.contextualMeaning)}</span>
            </div>
            <p class="vocab-item-sentence">${highlightWordInSentenceHtml(
              item.sentence,
              item.word
            )}</p>
            <p class="vocab-item-translation">${escapeHtml(item.sentenceTranslation)}</p>
          </div>
          <div class="vocab-item-actions">
            <button class="icon-btn vocab-speak-btn" data-speak="${escapeHtml(
              item.word
            )}" title="Dinle">🔊</button>
            <button class="icon-btn vocab-del-btn" data-id="${escapeHtml(
              item.id
            )}" title="Sil">🗑️</button>
          </div>
        </div>
      `
      )
      .join('');

    els.vocabListContainer.querySelectorAll('.vocab-speak-btn').forEach((btn) => {
      btn.addEventListener('click', () => speakText(btn.dataset.speak));
    });

    els.vocabListContainer.querySelectorAll('.vocab-del-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        removeVocabItem(btn.dataset.id);
        renderVocabModal();
      });
    });
  }

  function renderFlashcard() {
    const total = state.vocab.length;
    if (total === 0) return;

    const item = state.vocab[state.flashcardIndex];
    els.flashcardCounter.textContent = `Kart ${state.flashcardIndex + 1} / ${total}`;
    els.fcWord.textContent = item.word;
    els.fcSentence.innerHTML = highlightWordInSentenceHtml(item.sentence, item.word);
    els.fcMeaning.textContent = item.contextualMeaning;
    els.fcTranslation.textContent = item.sentenceTranslation;
    els.fcNote.textContent = item.grammarNote || '';
    els.fcBack.hidden = true;
  }

  function exportVocabularyCsv() {
    const list = getSavedVocab();
    if (list.length === 0) {
      alert('Dışa aktarılacak kayıtlı kelime bulunmuyor.');
      return;
    }

    const headers = [
      'Kelime',
      'Cümledeki Anlamı',
      'İngilizce Cümle',
      'Türkçe Cümle Çevirisi',
      'Kitap',
    ];
    const rows = list.map((item) =>
      [
        item.word,
        item.contextualMeaning,
        item.sentence,
        item.sentenceTranslation,
        item.bookTitle || '',
      ]
        .map((val) => `"${String(val || '').replace(/"/g, '""')}"`)
        .join(',')
    );

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `obzerver-kelimelerim-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function speakText(text) {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.rate = state.settings.speechRate || 0.9;
    window.speechSynthesis.speak(utter);
  }

  function highlightWordInSentenceHtml(sentence, word) {
    const safeSentence = escapeHtml(sentence);
    const escapedWord = escapeRegExp(escapeHtml(word));
    const regex = new RegExp(`(\\b${escapedWord}\\b)`, 'gi');
    return safeSentence.replace(regex, '<mark>$1</mark>');
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  init();
})();
