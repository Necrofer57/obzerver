/**
 * Ultra-Fast Contextual Meaning & Translation Engine
 *
 * Optimizations:
 * - Eliminated slow third-party dictionary API (which caused 20s Cloudflare 522 timeouts).
 * - Batches contextual phrase + full sentence translation into a single ~250ms request.
 * - Uses in-memory cache + hover prefetching for near-0ms instant response on click.
 * - If Gemini API key is configured, renders instant translation first and upgrades with AI analysis.
 */
(function (global) {
  const cache = new Map();
  const inflight = new Map();

  const IRREGULAR_LEMMAS = {
    caught: { base: 'catch', note: '"catch" fiilinin geçmiş zaman (V2/V3) hali' },
    wore: { base: 'wear', note: '"wear" fiilinin geçmiş zaman (V2) hali' },
    sunk: { base: 'sink', note: '"sink" fiilinin 3. hali (past participle)' },
    led: { base: 'lead', note: '"lead" fiilinin geçmiş zaman hali' },
    sprang: { base: 'spring', note: '"spring" fiilinin geçmiş zaman (V2) hali' },
    lay: { base: 'lie', note: '"lie" (uzanmak/bulunmak) fiilinin geçmiş zaman hali' },
    wrote: { base: 'write', note: '"write" fiilinin geçmiş zaman (V2) hali' },
    written: { base: 'write', note: '"write" fiilinin 3. hali (V3)' },
    saw: { base: 'see', note: '"see" fiilinin geçmiş zaman (V2) hali' },
    seen: { base: 'see', note: '"see" fiilinin 3. hali (V3)' },
    felt: { base: 'feel', note: '"feel" fiilinin geçmiş zaman hali' },
    taught: { base: 'teach', note: '"teach" fiilinin geçmiş zaman hali' },
    shone: { base: 'shine', note: '"shine" (parlamak) fiilinin geçmiş zaman hali' },
    broken: { base: 'break', note: '"break" fiilinin 3. hali / sıfat hali' },
    broke: { base: 'break', note: '"break" fiilinin geçmiş zaman (V2) hali' },
    went: { base: 'go', note: '"go" fiilinin geçmiş zaman (V2) hali' },
    gone: { base: 'go', note: '"go" fiilinin 3. hali (V3)' },
    took: { base: 'take', note: '"take" fiilinin geçmiş zaman (V2) hali' },
    taken: { base: 'take', note: '"take" fiilinin 3. hali (V3)' },
    came: { base: 'come', note: '"come" fiilinin geçmiş zaman (V2) hali' },
    thought: { base: 'think', note: '"think" fiilinin geçmiş zaman hali' },
    found: { base: 'find', note: '"find" fiilinin geçmiş zaman hali' },
    told: { base: 'tell', note: '"tell" fiilinin geçmiş zaman hali' },
    heard: { base: 'hear', note: '"hear" fiilinin geçmiş zaman hali' },
    kept: { base: 'keep', note: '"keep" fiilinin geçmiş zaman hali' },
    left: { base: 'leave', note: '"leave" fiilinin geçmiş zaman hali' },
    gave: { base: 'give', note: '"give" fiilinin geçmiş zaman (V2) hali' },
    given: { base: 'give', note: '"give" fiilinin 3. hali (V3)' },
    knew: { base: 'know', note: '"know" fiilinin geçmiş zaman (V2) hali' },
    known: { base: 'know', note: '"know" fiilinin 3. hali (V3)' },
    began: { base: 'begin', note: '"begin" fiilinin geçmiş zaman (V2) hali' },
    begun: { base: 'begin', note: '"begin" fiilinin 3. hali (V3)' },
    spoke: { base: 'speak', note: '"speak" fiilinin geçmiş zaman (V2) hali' },
    spoken: { base: 'speak', note: '"speak" fiilinin 3. hali (V3)' },
    fell: { base: 'fall', note: '"fall" fiilinin geçmiş zaman (V2) hali' },
    fallen: { base: 'fall', note: '"fall" fiilinin 3. hali (V3)' },
    stood: { base: 'stand', note: '"stand" fiilinin geçmiş zaman hali' },
    sat: { base: 'sit', note: '"sit" fiilinin geçmiş zaman hali' },
    held: { base: 'hold', note: '"hold" fiilinin geçmiş zaman hali' },
  };

  const POS_TR_MAP = {
    noun: 'İsim',
    verb: 'Fiil',
    adjective: 'Sıfat',
    adverb: 'Zarf',
    pronoun: 'Zamir',
    preposition: 'Edat',
    conjunction: 'Bağlaç',
    interjection: 'Ünlem',
  };

  const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'if', 'while', 'when', 'as', 'that', 'which', 'who',
    'whom', 'whose', 'this', 'these', 'those', 'is', 'was', 'were', 'are', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could',
    'may', 'might', 'must',
  ]);

  function analyzeMorphology(rawWord) {
    const clean = rawWord.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
    const lower = clean.toLowerCase();

    if (IRREGULAR_LEMMAS[lower]) {
      return {
        clean,
        lower,
        baseForm: IRREGULAR_LEMMAS[lower].base,
        grammarHint: IRREGULAR_LEMMAS[lower].note,
      };
    }

    if (lower.length > 4 && lower.endsWith('ied')) {
      return {
        clean,
        lower,
        baseForm: lower.slice(0, -3) + 'y',
        grammarHint: `Kök hali "${lower.slice(0, -3)}y" (-ed geçmiş zaman / sıfat eki almış)`,
      };
    }
    if (lower.length > 4 && lower.endsWith('ed')) {
      const base = lower.endsWith('eed') ? lower.slice(0, -1) : lower.slice(0, -2);
      return {
        clean,
        lower,
        baseForm: base,
        grammarHint: 'Cümlede geçmiş zaman (-ed) veya sıfat (participle) formunda kullanılmış.',
      };
    }
    if (lower.length > 5 && lower.endsWith('ing')) {
      return {
        clean,
        lower,
        baseForm: lower.slice(0, -3),
        grammarHint: 'Cümlede sürerlilik (-ing) veya isim-fiil (gerund) formunda kullanılmış.',
      };
    }
    if (lower.length > 4 && lower.endsWith('ly')) {
      return {
        clean,
        lower,
        baseForm: lower.slice(0, -2),
        grammarHint: 'Fiili veya sıfatı niteleyen zarf (-ly) formunda kullanılmış.',
      };
    }
    if (lower.length > 4 && lower.endsWith('ies')) {
      return {
        clean,
        lower,
        baseForm: lower.slice(0, -3) + 'y',
        grammarHint: `Çoğul isim veya geniş zaman eki almış (kök: "${lower.slice(0, -3)}y").`,
      };
    }
    if (lower.length > 3 && lower.endsWith('s') && !lower.endsWith('ss') && !lower.endsWith('us')) {
      return {
        clean,
        lower,
        baseForm: lower.slice(0, -1),
        grammarHint: 'Çoğul isim (-s) veya geniş zaman 3. tekil şahıs çekimi.',
      };
    }

    return {
      clean,
      lower,
      baseForm: lower,
      grammarHint: '',
    };
  }

  /**
   * Fast fetch wrapper with strict timeout so slow connections never hang the UI.
   */
  async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Returns cached result immediately if available.
   */
  function getCachedAnalysis(word, sentence, apiKey = '') {
    const morph = analyzeMorphology(word);
    const cacheKey = `${morph.lower}::${sentence}::${Boolean(apiKey)}`;
    return cache.get(cacheKey) || null;
  }

  /**
   * Main entry point: Analyzes `word` inside `sentence` in ~200-350ms.
   */
  async function analyzeWordInContext(word, sentence, apiKey = '', onFastPreview = null) {
    const morph = analyzeMorphology(word);
    const cacheKey = `${morph.lower}::${sentence}::${Boolean(apiKey)}`;

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    if (inflight.has(cacheKey)) {
      return inflight.get(cacheKey);
    }

    const promise = (async () => {
      try {
        // Always compute the fast (~250ms) contextual analysis first
        const fastResult = await buildSmartFastAnalysis(morph, sentence);

        // If user also configured a Gemini API key, show the fast result immediately
        // and then upgrade with deep Gemini 3.8 Flash analysis
        if (apiKey && apiKey.trim().length > 10) {
          if (typeof onFastPreview === 'function') {
            onFastPreview(fastResult);
          }
          try {
            const aiData = await analyzeWithGemini(morph.clean, sentence, apiKey.trim());
            const aiResult = {
              word: morph.clean,
              sentence,
              Engine: 'Gemini 3.8 Flash AI',
              phonetic: '',
              audioUrl: '',
              partOfSpeech: aiData.part_of_speech || fastResult.partOfSpeech || '',
              baseForm: aiData.base_form || morph.baseForm,
              contextualMeaning: aiData.contextual_meaning,
              sentenceTranslation: aiData.sentence_translation || fastResult.sentenceTranslation,
              grammarNote: aiData.grammar_note || morph.grammarHint,
              otherMeanings:
                aiData.other_meanings?.length > 0
                  ? aiData.other_meanings.map((m) => ({ pos: 'Anlam', text: m }))
                  : fastResult.otherMeanings,
            };
            cache.set(cacheKey, aiResult);
            return aiResult;
          } catch (err) {
            console.warn('Gemini API fallback to Smart Fast Mode:', err);
          }
        }

        cache.set(cacheKey, fastResult);
        return fastResult;
      } finally {
        inflight.delete(cacheKey);
      }
    })();

    inflight.set(cacheKey, promise);
    return promise;
  }

  /**
   * Ultra-fast (~250ms) contextual lookup using 2 parallel requests:
   * 1. Word dictionary lookup (dt=t & dt=bd) -> Turkish word meanings grouped by part-of-speech
   * 2. Batched [contextualPhrase + "\n" + fullSentence] -> Exact contextual phrase meaning + full sentence translation
   */
  async function buildSmartFastAnalysis(morph, sentence) {
    const contextualPhrase = extractMeaningfulWindow(morph.clean, sentence);
    const hasPhrase =
      contextualPhrase &&
      contextualPhrase.toLowerCase() !== morph.lower &&
      contextualPhrase.split(/\s+/).length >= 2;

    const batchQuery = hasPhrase ? `${contextualPhrase}\n${sentence}` : sentence;

    const [wordDict, batchLines] = await Promise.all([
      fetchWordWithDictionary(morph.clean),
      fetchBatchTranslationLines(batchQuery),
    ]);

    let phraseTr = '';
    let sentenceTr = '';
    if (hasPhrase && batchLines.length >= 2) {
      phraseTr = batchLines[0].trim();
      sentenceTr = batchLines.slice(1).join(' ').trim();
    } else {
      sentenceTr = batchLines.join(' ').trim();
    }

    // Pick the best contextual meaning for the word in this sentence:
    // Check if any of the word's dictionary alternatives actually appear inside the translated sentence or phrase!
    const matchedInSentence = findBestMatchingAlternative(
      wordDict.primary,
      wordDict.allTerms,
      phraseTr || sentenceTr
    );

    let contextualMeaning = matchedInSentence || wordDict.primary || morph.clean;
    if (
      hasPhrase &&
      phraseTr &&
      phraseTr.toLowerCase() !== contextualMeaning.toLowerCase()
    ) {
      contextualMeaning = `${contextualMeaning}  •  "${contextualPhrase}" → ${phraseTr}`;
    }

    return {
      word: morph.clean,
      sentence,
      Engine: 'Hızlı Bağlam Motoru',
      phonetic: '',
      audioUrl: '',
      partOfSpeech: wordDict.pos || '',
      baseForm: morph.baseForm,
      contextualMeaning,
      sentenceTranslation: sentenceTr || 'Cümle çevirisi alınamadı.',
      grammarNote: morph.grammarHint,
      otherMeanings: wordDict.groupedMeanings,
    };
  }

  /**
   * Checks which Turkish dictionary meaning of the word actually appears (or stems) inside the translated sentence!
   * For example: if "brightly" has alternatives ["parlak bir şekilde", "parlak", "canlı"] and the sentence
   * translation contains "parlak bir şekilde yanıyordu", it selects "parlak bir şekilde"!
   */
  function findBestMatchingAlternative(primary, allTerms, targetTrText) {
    if (!targetTrText || !allTerms || allTerms.length === 0) return primary;
    const lowerTarget = targetTrText.toLowerCase();

    // Sort longer matches first so multi-word Turkish meanings match accurately
    const sorted = [...allTerms].sort((a, b) => b.length - a.length);

    for (const term of sorted) {
      const lowerTerm = term.toLowerCase();
      if (lowerTerm.length >= 3 && lowerTarget.includes(lowerTerm)) {
        return term;
      }
      // Also check root prefix (first 4-5 letters in Turkish agglutination, e.g., "çatı katı" -> "çatı katında")
      const stem = lowerTerm.length >= 5 ? lowerTerm.slice(0, -1) : lowerTerm;
      if (stem.length >= 4 && lowerTarget.includes(stem)) {
        return term;
      }
    }
    return primary;
  }

  /**
   * Extracts a meaningful 2-3 word collocation / phrase around the clicked word in the sentence.
   */
  function extractMeaningfulWindow(word, sentence) {
    const rawTokens = sentence
      .split(/\s+/)
      .map((t) => t.replace(/^[,.;:!?'"“”()—–-]+|[,.;:!?'"“”()—–-]+$/g, ''))
      .filter(Boolean);

    const idx = rawTokens.findIndex((t) => t.toLowerCase() === word.toLowerCase());
    if (idx === -1) return word;

    const prev = idx > 0 ? rawTokens[idx - 1] : '';
    const next = idx < rawTokens.length - 1 ? rawTokens[idx + 1] : '';
    const next2 = idx < rawTokens.length - 2 ? rawTokens[idx + 2] : '';

    // If followed by a preposition/particle or object (e.g. "caught her eye", "give up", "sprang open", "leaned back")
    if (next && !STOPWORDS.has(word.toLowerCase())) {
      if (next2 && ['her', 'his', 'my', 'your', 'the', 'a', 'an'].includes(next.toLowerCase())) {
        return `${ rawTokens[idx] } ${next} ${next2}`;
      }
      if (!STOPWORDS.has(next.toLowerCase()) || ['up', 'out', 'in', 'on', 'off', 'away', 'back', 'open', 'into', 'over', 'through'].includes(next.toLowerCase())) {
        return `${rawTokens[idx]} ${next}`;
      }
    }

    if (prev && !STOPWORDS.has(prev.toLowerCase())) {
      return `${prev} ${rawTokens[idx]}`;
    }

    return word;
  }

  /**
   * Single fast request (~200ms) for word translation + POS + grouped Turkish meanings
   */
  async function fetchWordWithDictionary(word) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&dt=bd&q=${encodeURIComponent(
        word
      )}`;
      const res = await fetchWithTimeout(url, {}, 2200);
      if (res.ok) {
        const data = await res.json();
        const primary = data?.[0]?.[0]?.[0] || word;
        const allTerms = [primary];
        const groupedMeanings = [];
        let firstPos = '';

        if (Array.isArray(data?.[1])) {
          for (const group of data[1]) {
            const rawPos = group?.[0] || '';
            const trPos = POS_TR_MAP[rawPos.toLowerCase()] || rawPos || 'Anlam';
            if (!firstPos && trPos) firstPos = trPos;

            const terms = Array.isArray(group?.[1]) ? group[1].slice(0, 6) : [];
            if (terms.length > 0) {
              groupedMeanings.push({
                pos: trPos,
                text: terms.join(', '),
              });
              for (const t of terms) {
                if (!allTerms.includes(t)) allTerms.push(t);
              }
            }
          }
        }

        return {
          primary,
          pos: firstPos,
          allTerms,
          groupedMeanings,
        };
      }
    } catch {
      // Ignore and fallback
    }
    return { primary: word, pos: '', allTerms: [word], groupedMeanings: [] };
  }

  /**
   * Translates newline-separated lines in a single ~250ms HTTP call
   */
  async function fetchBatchTranslationLines(text) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=${encodeURIComponent(
        text
      )}`;
      const res = await fetchWithTimeout(url, {}, 2500);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.[0])) {
          const fullTranslated = data[0].map((part) => part[0]).join('');
          return fullTranslated.split('\n');
        }
      }
    } catch {
      // Fallback to MyMemory with timeout
    }

    try {
      const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
        text
      )}&langpair=en|tr`;
      const res = await fetchWithTimeout(mmUrl, {}, 2500);
      if (res.ok) {
        const data = await res.json();
        const tr = data?.responseData?.translatedText || '';
        return tr.split('\n');
      }
    } catch {
      // Ignore
    }
    return [''];
  }

  /**
   * Optional deep contextual analysis via Gemini 3.8 Flash Interactions API
   */
  async function analyzeWithGemini(word, sentence, apiKey) {
    const prompt = `Sen uzman bir İngilizce-Türkçe okuma ve dilbilim asistanısın.
Kullanıcı bir İngilizce kitap okurken aşağıdaki cümlede geçen "${word}" kelimesine tıkladı.

Cümle: "${sentence}"
Tıklanan Kelime: "${word}"

Lütfen bu kelimenin sözlükteki rastgele anlamlarını değil, TAM OLARAK BU CÜMLE İÇİNDEKİ BAĞLAMSAL ANLAMINI Türkçe olarak açıkla.`;

    const responseFormatSchema = {
      type: 'object',
      properties: {
        contextual_meaning: {
          type: 'string',
          description: 'Kelimenin tam olarak bu cümle içindeki Türkçe karşılığı',
        },
        sentence_translation: {
          type: 'string',
          description: 'Cümlenin tamamının doğal ve akıcı Türkçe çevirisi',
        },
        part_of_speech: {
          type: 'string',
          description: 'Cümledeki kelime türü (İsim, Fiil, Sıfat, Zarf, Deyim vb.)',
        },
        base_form: {
          type: 'string',
          description: 'Kelimenin yalın/kök hali (lemma)',
        },
        grammar_note: {
          type: 'string',
          description: 'Kelimenin bu cümlede nasıl kullanıldığına dair 1 cümlelik Türkçe ipucu',
        },
        other_meanings: {
          type: 'array',
          items: { type: 'string' },
          description: 'Kelimenin diğer yaygın Türkçe anlamları (en fazla 3 adet)',
        },
      },
      required: [
        'contextual_meaning',
        'sentence_translation',
        'part_of_speech',
        'base_form',
        'grammar_note',
        'other_meanings',
      ],
    };

    const res = await fetchWithTimeout(
      'https://generativelanguage.googleapis.com/v1beta2/interactions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          model: 'gemini-3.8-flash',
          input: prompt,
          store: false,
          response_format: [
            {
              type: 'text',
              mime_type: 'application/json',
              schema: responseFormatSchema,
            },
          ],
        }),
      },
      6000
    );

    if (!res.ok) {
      throw new Error(`Gemini API HTTP ${res.status}`);
    }
    const data = await res.json();
    const modelStep = (data.steps || []).find((s) => s.type === 'model_output');
    const textPart = (modelStep?.content || []).find((c) => c.type === 'text');
    return JSON.parse(textPart.text);
  }

  global.ContextReadEngine = {
    analyzeMorphology,
    analyzeWordInContext,
    getCachedAnalysis,
  };
})(window);
