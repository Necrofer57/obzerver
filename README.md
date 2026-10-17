# 👁️‍🗨️ Obzerver — Bağlam Odaklı İngilizce EPUB Okuyucu

**Obzerver**, İngilizce öğrenirken `.epub` uzantılı kitapları okumanızı kolaylaştıran, **mobil öncelikli (mobile-first)** ve **bağlam odaklı (context-aware)** bir web okuyucusudur.

Okurken bilmediğiniz bir kelimeye dokunduğunuzda, sıradan sözlükler gibi rastgele 15 farklı anlam sıralamak yerine **kelimenin tam o cümle içindeki Türkçe karşılığını**, cümlenin tam çevirisini, kelimenin kök halini ve sesli telaffuzunu anında gösterir.

## ✨ Temel Özellikler

- 📱 **Mobil Öncelikli Tasarım (Bottom Sheet & Slide-Over Drawer):** Telefon ekranında %100 okuma alanı sunar; bir kelimeye dokunduğunuzda alttan kayarak açılan akıllı çekmecede (Bottom Sheet) anlamı gösterir.
- ⚡ **Anında Bağlamsal Çeviri (`0-250 ms`):** Dokunmatik ön-yükleme (`pointerdown` & `hover` prefetch) ve toplu cümle/kelime öbeği analiziyle beklemeden anında sonuç verir.
- 🤖 **İsteğe Bağlı Gemini 3.8 Flash AI Desteği:** API anahtarı olmadan doğrudan çalışır; ayrıca ücretsiz bir Gemini API anahtarı girildiğinde deyimleri, mecaz anlamları ve gramer yapılarını derinlemesine açıklar.
- 📚 **Tarayıcı İçi EPUB Ayrıştırıcı & Kalıcı Kitaplık:** Yüklediğiniz `.epub` dosyalarını `IndexedDB` üzerinde saklar, kaldığınız bölümü hatırlar.
- 🗂️ **Kelime Defteri & Flashcard Test Modu:** Kaydettiğiniz kelimeleri kitapta geçtiği orijinal cümleleriyle birlikte kartlarla test edebilir veya **CSV / Anki** formatında dışa aktarabilirsiniz.
- 🎨 **3 Okuma Teması:** Kağıt, Sepya ve Gece (Dark) modu ile ayarlanabilir yazı boyutu.

## 🚀 Çalıştırma

Herhangi bir kurulum (Node.js veya Python) gerektirmez:
- Doğrudan `index.html` dosyasını tarayıcıda açabilir veya
- Windows'ta `baslat.bat` dosyasına çift tıklayarak yerel sunucuda (`http://localhost:8080`) başlatabilirsiniz.
