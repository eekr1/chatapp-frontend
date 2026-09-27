# [Ürün] Frontend Görsel İnceleme Notları

Bu dosya deploy sonrası görsel inceleme bulgularını, kararları, uygulama sırasını ve kapanış kanıtını tek yerde toplar.

## İnceleme özeti

- **Tarih:** YYYY-AA-GG
- **İncelenen sürüm/commit:**
- **Branch:**
- **Kapsam:**
- **Durum:** İnceleme sürüyor
- **Toplam bulgu:** 0
- **Görsel kanıt:** `frontend-visual-review-assets/`
- **Kapsam dışı işler:**

## Durumlar

- `Bekliyor`: Kaydedildi, henüz uygulanmadı.
- `Kararlaştırıldı`: Tasarım yönü netleşti.
- `Düzeltildi`: Kod tamamlandı, doğrulama bekliyor.
- `Test edildi`: Hedef görünüm ve davranış doğrulandı.

---

## [Ekran / Akış]

### [ALAN-001] — [Kısa ve net bulgu başlığı]

- **Durum:** Bekliyor
- **Öncelik:** Düşük / Orta / Yüksek / Acil
- **Kapsam:** Masaüstü / Mobil / İkisi
- **Kanıt:** `frontend-visual-review-assets/ornek.png`
- **Bağımlılık:** Yok

![Bulgu açıklaması](frontend-visual-review-assets/ornek.png)

#### Mevcut durum

Sorunun kullanıcıya nasıl göründüğünü ve neden rahatsız edici olduğunu kısa, gözlemlenebilir cümlelerle yaz.

#### Kararlaştırılan yön

- Korunacak parçalar.
- Değişecek parçalar.
- Ortak bileşen veya tasarım sistemi kararı.
- Davranışın değişip değişmeyeceği.

#### Referans tasarım

- **Dosya:** `frontend-visual-review-assets/ornek-referans.png`
- **Onay durumu:** Bekliyor / Onaylandı

![Onaylı referans](frontend-visual-review-assets/ornek-referans.png)

#### Kabul kriterleri

- [ ] Masaüstünde taşma, kesilme veya gereksiz scrollbar yok.
- [ ] Mobilde yatay taşma ve kontrol çakışması yok.
- [ ] Hover, active, focus, disabled ve hata durumları anlaşılır.
- [ ] Klavye kullanımı ve erişilebilir adlar korunuyor.
- [ ] Mevcut işlevlerde regresyon yok.

---

## Uygulama sırası

1. [ ] Ortak temel bileşen veya tasarım sistemi düzeltmesi.
2. [ ] Ana ekran düzenlemesi.
3. [ ] İkincil ekran düzenlemesi.
4. [ ] Responsive ve erişilebilirlik düzeltmeleri.
5. [ ] Otomatik ve manuel doğrulama.

## Otomatik doğrulama

- [ ] Lint başarılı.
- [ ] Otomatik testler başarılı: `__/__`.
- [ ] Production build başarılı.
- [ ] Diff yalnız planlanan dosyaları içeriyor.
- [ ] Hedef branch ve remote doğrulandı.

## Hızlı manuel kapanış checklist'i

### Masaüstü

- [ ] Temel içerik hedef viewport'a doğru yerleşiyor.
- [ ] Dikey/yatay taşma veya kesilen içerik yok.
- [ ] Tüm ana eylemler doğru işlemi tetikliyor.

### Mobil / dar ekran

- [ ] Yatay taşma yok.
- [ ] Dokunma hedefleri rahat kullanılabiliyor.
- [ ] Metinler ve kontroller üst üste binmiyor.

### Etkileşim ve erişilebilirlik

- [ ] Klavye odağı ve sekme sırası anlaşılır.
- [ ] İkonların erişilebilir adları ve gerekiyorsa tooltip'leri var.
- [ ] Uzun metin, boşluksuz metin ve yerelleştirilmiş metinler kontrollü kırılıyor.

### Son regresyon

- [ ] Kritik kullanıcı akışları çalışıyor.
- [ ] Desteklenen dillerde bozuk karakter veya metin taşması yok.
- [ ] Tarayıcı konsolunda yeni hata yok.

## Ayrı işler / kapsam dışı bağımlılıklar

- [ ] Frontend kapanışını engellemeyen backend veya veri işi.

## Kapanış

- **Son durum:**
- **Doğrulayan:**
- **Commit:**
- **Deploy:**
- **Not:**
