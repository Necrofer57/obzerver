/**
 * Client-side EPUB Parser & Interactive Sentence/Word Tokenizer
 * Supports EPUB 2 and EPUB 3 archives directly in the browser via JSZip.
 */
(function (global) {
  const sentenceSegmenter =
    typeof Intl !== 'undefined' && Intl.Segmenter
      ? new Intl.Segmenter('en', { granularity: 'sentence' })
      : null;

  const wordSegmenter =
    typeof Intl !== 'undefined' && Intl.Segmenter
      ? new Intl.Segmenter('en', { granularity: 'word' })
      : null;

  function resolveZipPath(baseDir, relativeHref) {
    if (!relativeHref) return '';
    const cleanHref = decodeURIComponent(relativeHref.split('#')[0]);
    if (cleanHref.startsWith('/')) return cleanHref.slice(1);

    const stack = baseDir ? baseDir.split('/').filter(Boolean) : [];
    const parts = cleanHref.split('/');

    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') {
        stack.pop();
      } else {
        stack.push(part);
      }
    }
    return stack.join('/');
  }

  function getZipEntry(zip, path) {
    let entry = zip.file(path);
    if (entry) return entry;
    const lower = path.toLowerCase();
    const matchedKey = Object.keys(zip.files).find((k) => k.toLowerCase() === lower);
    return matchedKey ? zip.file(matchedKey) : null;
  }

  async function parseEpubBuffer(arrayBuffer, fallbackFileName = 'Book.epub') {
    if (!window.JSZip) {
      throw new Error('JSZip kütüphanesi yüklenemedi. Lütfen internet bağlantınızı kontrol edin.');
    }

    const zip = await window.JSZip.loadAsync(arrayBuffer);
    const parser = new DOMParser();

    // 1. Read META-INF/container.xml
    const containerEntry = getZipEntry(zip, 'META-INF/container.xml');
    if (!containerEntry) {
      throw new Error('Geçersiz EPUB dosyası: META-INF/container.xml bulunamadı.');
    }
    const containerXml = await containerEntry.async('string');
    const containerDoc = parser.parseFromString(containerXml, 'application/xml');
    const rootfileEl = containerDoc.querySelector('rootfile');
    const opfPath = rootfileEl?.getAttribute('full-path');
    if (!opfPath) {
      throw new Error('EPUB içinde OPF paket yolu bulunamadı.');
    }

    const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';
    const opfEntry = getZipEntry(zip, opfPath);
    if (!opfEntry) {
      throw new Error(`EPUB paket dosyası (${opfPath}) bulunamadı.`);
    }

    const opfXml = await opfEntry.async('string');
    const opfDoc = parser.parseFromString(opfXml, 'application/xml');

    // 2. Extract Metadata
    const titleEl =
      opfDoc.getElementsByTagNameNS('*', 'title')[0] || opfDoc.querySelector('title');
    const creatorEl =
      opfDoc.getElementsByTagNameNS('*', 'creator')[0] || opfDoc.querySelector('creator');

    const title = titleEl?.textContent?.trim() || fallbackFileName.replace(/\.epub$/i, '');
    const author = creatorEl?.textContent?.trim() || 'Bilinmeyen Yazar';

    // 3. Build Manifest Map
    const manifest = new Map();
    const manifestItems = Array.from(opfDoc.getElementsByTagNameNS('*', 'item'));
    for (const item of manifestItems) {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      const mediaType = item.getAttribute('media-type') || '';
      const properties = item.getAttribute('properties') || '';
      if (id && href) {
        manifest.set(id, {
          id,
          href,
          fullPath: resolveZipPath(opfDir, href),
          mediaType,
          properties,
        });
      }
    }

    // 4. Preload images into Blob URLs so chapter illustrations work
    const imageBlobUrls = new Map();
    for (const item of manifest.values()) {
      if (item.mediaType.startsWith('image/')) {
        const imgEntry = getZipEntry(zip, item.fullPath);
        if (imgEntry) {
          try {
            const blob = await imgEntry.async('blob');
            const typedBlob = new Blob([blob], { type: item.mediaType });
            imageBlobUrls.set(item.fullPath, URL.createObjectURL(typedBlob));
          } catch {
            // Ignore broken image entries
          }
        }
      }
    }

    // 5. Extract TOC (NCX or EPUB3 Nav)
    const tocTitleByPath = new Map();
    const navItem = Array.from(manifest.values()).find((i) =>
      i.properties.split(/\s+/).includes('nav')
    );
    const ncxItem = Array.from(manifest.values()).find(
      (i) => i.mediaType === 'application/x-dtbncx+xml' || i.href.endsWith('.ncx')
    );

    if (navItem) {
      const navEntry = getZipEntry(zip, navItem.fullPath);
      if (navEntry) {
        const navHtml = await navEntry.async('string');
        const navDoc = parser.parseFromString(navHtml, 'text/html');
        const navDir = navItem.fullPath.includes('/')
          ? navItem.fullPath.slice(0, navItem.fullPath.lastIndexOf('/'))
          : '';
        navDoc.querySelectorAll('nav a[href]').forEach((a) => {
          const targetPath = resolveZipPath(navDir, a.getAttribute('href'));
          const label = a.textContent.trim();
          if (targetPath && label && !tocTitleByPath.has(targetPath)) {
            tocTitleByPath.set(targetPath, label);
          }
        });
      }
    }

    if (ncxItem && tocTitleByPath.size === 0) {
      const ncxEntry = getZipEntry(zip, ncxItem.fullPath);
      if (ncxEntry) {
        const ncxXml = await ncxEntry.async('string');
        const ncxDoc = parser.parseFromString(ncxXml, 'application/xml');
        const ncxDir = ncxItem.fullPath.includes('/')
          ? ncxItem.fullPath.slice(0, ncxItem.fullPath.lastIndexOf('/'))
          : '';
        const navPoints = Array.from(ncxDoc.getElementsByTagNameNS('*', 'navPoint'));
        for (const np of navPoints) {
          const textEl = np.getElementsByTagNameNS('*', 'text')[0];
          const contentEl = np.getElementsByTagNameNS('*', 'content')[0];
          const label = textEl?.textContent?.trim();
          const src = contentEl?.getAttribute('src');
          if (label && src) {
            const targetPath = resolveZipPath(ncxDir, src);
            if (!tocTitleByPath.has(targetPath)) {
              tocTitleByPath.set(targetPath, label);
            }
          }
        }
      }
    }

    // 6. Read Spine Chapters in reading order
    const spineItems = Array.from(opfDoc.getElementsByTagNameNS('*', 'itemref'));
    const chapters = [];

    for (let i = 0; i < spineItems.length; i++) {
      const idref = spineItems[i].getAttribute('idref');
      const manifestItem = manifest.get(idref);
      if (!manifestItem) continue;

      const chapterEntry = getZipEntry(zip, manifestItem.fullPath);
      if (!chapterEntry) continue;

      const rawHtml = await chapterEntry.async('string');
      const chapterDir = manifestItem.fullPath.includes('/')
        ? manifestItem.fullPath.slice(0, manifestItem.fullPath.lastIndexOf('/'))
        : '';

      const processed = prepareChapterHtml(rawHtml, chapterDir, imageBlobUrls);
      if (!processed.hasText && !processed.hasImages) {
        continue;
      }

      const chapterTitle =
        tocTitleByPath.get(manifestItem.fullPath) ||
        processed.extractedHeading ||
        `Bölüm ${chapters.length + 1}`;

      chapters.push({
        index: chapters.length,
        id: idref,
        title: chapterTitle,
        path: manifestItem.fullPath,
        html: processed.html,
      });
    }

    if (chapters.length === 0) {
      throw new Error('EPUB içinde okunabilir metin bölümü bulunamadı.');
    }

    return {
      title,
      author,
      chapters,
    };
  }

  function prepareChapterHtml(rawHtml, chapterDir, imageBlobUrls) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    const body = doc.body || doc.documentElement;

    body.querySelectorAll('script, style, link, iframe, object').forEach((el) => el.remove());

    body.querySelectorAll('img[src], image[href], image[*|href]').forEach((img) => {
      const rawSrc =
        img.getAttribute('src') ||
        img.getAttribute('href') ||
        img.getAttribute('xlink:href');
      if (rawSrc && !rawSrc.startsWith('data:') && !rawSrc.startsWith('http')) {
        const resolved = resolveZipPath(chapterDir, rawSrc);
        const blobUrl = imageBlobUrls.get(resolved);
        if (blobUrl) {
          if (img.tagName.toLowerCase() === 'img') {
            img.setAttribute('src', blobUrl);
          } else {
            img.setAttribute('href', blobUrl);
          }
        }
      }
    });

    body.querySelectorAll('a').forEach((a) => {
      a.removeAttribute('href');
    });

    const headingEl = body.querySelector('h1, h2, h3');
    const extractedHeading = headingEl?.textContent?.trim()?.slice(0, 80) || '';
    const plainText = body.textContent?.trim() || '';
    const hasImages = body.querySelectorAll('img, svg, image').length > 0;

    return {
      html: body.innerHTML,
      extractedHeading,
      hasText: plainText.length > 0,
      hasImages,
    };
  }

  function makeContainerInteractive(containerEl, savedWordsSet = new Set()) {
    const blockTags = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, div, td, figcaption';
    const blocks = Array.from(containerEl.querySelectorAll(blockTags));

    if (blocks.length === 0) {
      tokenizeBlockElement(containerEl, savedWordsSet);
      return;
    }

    for (const block of blocks) {
      const hasChildBlock = Array.from(block.children).some(
        (child) =>
          child.matches &&
          child.matches('p, div, blockquote, ul, ol, table, section, article')
      );
      if (!hasChildBlock) {
        tokenizeBlockElement(block, savedWordsSet);
      }
    }
  }

  function tokenizeBlockElement(blockEl, savedWordsSet) {
    const fullBlockText = blockEl.textContent?.trim();
    if (!fullBlockText) return;

    const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let currentNode;
    while ((currentNode = walker.nextNode())) {
      if (currentNode.nodeValue && currentNode.nodeValue.trim().length > 0) {
        textNodes.push(currentNode);
      }
    }

    for (const textNode of textNodes) {
      const text = textNode.nodeValue;
      const fragment = document.createDocumentFragment();
      const sentences = splitIntoSentences(text);

      for (const sentenceText of sentences) {
        const cleanSentence = sentenceText.replace(/\s+/g, ' ').trim();
        if (!cleanSentence) {
          fragment.appendChild(document.createTextNode(sentenceText));
          continue;
        }

        const sentenceSpan = document.createElement('span');
        sentenceSpan.className = 'ctx-sentence';
        sentenceSpan.dataset.sentence = cleanSentence;

        const tokens = splitIntoWords(sentenceText);
        for (const token of tokens) {
          if (token.isWord) {
            const wordSpan = document.createElement('span');
            const lowerWord = token.text.toLowerCase().replace(/^['’]+|['’]+$/g, '');
            wordSpan.className = 'ctx-word';
            if (savedWordsSet.has(lowerWord)) {
              wordSpan.classList.add('saved-word');
            }
            wordSpan.dataset.word = token.text;
            wordSpan.textContent = token.text;
            sentenceSpan.appendChild(wordSpan);
          } else {
            sentenceSpan.appendChild(document.createTextNode(token.text));
          }
        }

        fragment.appendChild(sentenceSpan);
      }

      textNode.parentNode.replaceChild(fragment, textNode);
    }
  }

  function splitIntoSentences(text) {
    if (sentenceSegmenter) {
      return Array.from(sentenceSegmenter.segment(text), (s) => s.segment);
    }
    return text.match(/[^.!?]+[.!?]+[\s"”']*|.+/g) || [text];
  }

  function splitIntoWords(sentenceText) {
    if (wordSegmenter) {
      return Array.from(wordSegmenter.segment(sentenceText), (seg) => ({
        text: seg.segment,
        isWord: Boolean(seg.isWordLike && /[a-zA-Z]/.test(seg.segment)),
      }));
    }
    const parts = sentenceText.split(/([a-zA-Z]+(?:['’][a-zA-Z]+)?)/g);
    return parts
      .filter((p) => p.length > 0)
      .map((p) => ({
        text: p,
        isWord: /^[a-zA-Z]+(?:['’][a-zA-Z]+)?$/.test(p),
      }));
  }

  function getSampleBook(sampleKey = 'beginner') {
    const samples = {
      beginner: {
        id: 'sample-beginner',
        title: 'The Mysterious Key & Short Stories',
        author: 'Obzerver Graded Reader (A1-A2)',
        chapters: [
          {
            index: 0,
            id: 'ch1',
            title: 'Chapter 1: The Old Brass Key',
            html: `
              <h2>Chapter 1: The Old Brass Key</h2>
              <p>On a rainy Tuesday afternoon, Clara decided to clean her grandfather's dusty attic. Boxes of old letters, faded photographs, and broken clocks covered the wooden floor.</p>
              <p>While she was moving a heavy leather trunk, something small and shiny caught her eye. It was a heavy brass key tied to a faded blue ribbon. On the ribbon, someone had written a single word in ink: <em>"Patience."</em></p>
              <p>"What could this unlock?" Clara whispered to herself. She tried the key on the leather trunk, but the lock was far too large. She checked the wooden cupboard in the corner, yet it had no keyhole at all.</p>
              <p>Just as she was about to give up, she noticed a loose floorboard beneath the window. When she lifted the board, she discovered a small carved music box resting in the shadows.</p>
              <p>Her hands trembled slightly as she inserted the brass key into the tiny slot. It turned smoothly with a soft click. Immediately, a gentle melody filled the quiet room, and a hidden drawer sprang open at the bottom of the box.</p>
            `,
          },
          {
            index: 1,
            id: 'ch2',
            title: 'Chapter 2: The Map to the Lighthouse',
            html: `
              <h2>Chapter 2: The Map to the Lighthouse</h2>
              <p>Inside the secret drawer lay a folded piece of parchment and a silver compass. Clara carefully unfolded the paper and realized it was a hand-drawn map of the coastline near her village.</p>
              <p>A red cross marked the abandoned lighthouse on the northern cliff. Below the drawing, her grandfather had written a short note: <em>"True treasure belongs to those who look beyond the horizon."</em></p>
              <p>The rain had finally stopped, leaving a crisp scent of pine and sea salt in the air. Clara slipped the compass into her coat pocket, grabbed her flashlight, and headed toward the coastal path before sunset.</p>
            `,
          },
        ],
      },
      intermediate: {
        id: 'sample-intermediate',
        title: 'A Scandal in Bohemia (Sherlock Holmes)',
        author: 'Sir Arthur Conan Doyle (B1-B2)',
        chapters: [
          {
            index: 0,
            id: 'sh1',
            title: 'Part I: The Masked Visitor',
            html: `
              <h2>Part I: The Masked Visitor</h2>
              <p>To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex. It was not that he felt any emotion akin to love for Irene Adler.</p>
              <p>One night—it was on the twentieth of March, 1888—I was returning from a journey to a patient, when my way led me through Baker Street. As I passed the well-remembered door, I was seized with a keen desire to see Holmes again, and to know how he was employing his extraordinary powers.</p>
              <p>His rooms were brilliantly lit, and, even as I looked up, I saw his tall, spare figure pass twice in a dark silhouette against the blind. He was pacing the room swiftly, eagerly, with his head sunk upon his chest and his hands clasped behind him.</p>
              <p>"You see, but you do not observe," Holmes remarked with a gentle smile after greeting me. "The distinction is clear. For example, you have frequently seen the steps which lead up from the hall to this room, yet you have never counted them."</p>
            `,
          },
          {
            index: 1,
            id: 'sh2',
            title: 'Part II: A Matter of Delicacy',
            html: `
              <h2>Part II: A Matter of Delicacy</h2>
              <p>A loud knock sounded at the street door, and a moment later a tall man entered the chamber. He wore a heavy cloak and a black mask that concealed the upper part of his face.</p>
              <p>"You may address me as the Count Von Kramm, a Bohemian nobleman," said the stranger in a deep, resonant voice. "I have come to consult you upon an affair of the utmost importance, one that could compromise a royal family."</p>
              <p>Holmes leaned back in his armchair and placed his fingertips together. "Pray state your case," he said calmly. "I am accustomed to mystery, and nothing you say will go beyond these walls."</p>
            `,
          },
        ],
      },
      advanced: {
        id: 'sample-advanced',
        title: 'The Time Machine',
        author: 'H.G. Wells (B2-C1)',
        chapters: [
          {
            index: 0,
            id: 'tm1',
            title: 'Chapter I: The Fourth Dimension',
            html: `
              <h2>Chapter I: The Fourth Dimension</h2>
              <p>The Time Traveller (for so it will be convenient to speak of him) was expounding a recondite matter to us. His grey eyes shone and twinkled, and his usually pale face was flushed and animated. The fire burned brightly, and the soft radiance of the incandescent lights in the lilies of silver caught the bubbles that flashed and passed in our glasses.</p>
              <p>"You must follow me carefully," he said. "I shall have to controvert one or two ideas that are almost universally accepted. The geometry, for instance, they taught you at school is founded on a misconception."</p>
              <p>"Clearly," the Time Traveller proceeded, "any real body must have extension in four directions: it must have Length, Breadth, Thickness, and—Duration. But through a natural infirmity of the flesh, which I will explain to you in a moment, we incline to overlook this fact. There are really four dimensions, three which we call the three planes of Space, and a fourth, Time."</p>
            `,
          },
        ],
      },
    };

    return samples[sampleKey] || samples.beginner;
  }

  global.ContextReadEpub = {
    parseEpubBuffer,
    makeContainerInteractive,
    getSampleBook,
  };
})(window);
