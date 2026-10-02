# TalkX Frontend

TalkX'in React/Vite web istemcisi ve Capacitor Android kaynağıdır. Anonim eşleşme, arkadaş sohbeti, profil/ayarlar, yasal metinler, bildirim ve Android entegrasyonlarını içerir.

## Gereksinimler

- Node.js 20 veya üzeri
- npm
- Android paketi için Android Studio ve JDK 21
- Çalışan TalkX backend URL'si

## Yerel kurulum

```powershell
Copy-Item .env.example .env
npm ci
npm run dev
```

Varsayılan geliştirme adresi Vite tarafından terminalde gösterilir. `.env` içine yalnız hedef backend ve WebSocket adresleri yazılır; secret konmaz.

## Ortam değişkenleri

| Değişken | Zorunlu | Açıklama |
|---|---:|---|
| `VITE_API_URL` | Evet | Backend HTTP(S) taban adresi |
| `VITE_WS_URL` | Hayır | WebSocket adresi; boşsa API URL'sinden türetilir |

## Kalite ve build

```powershell
npm run quality:all
npm run build
```

`quality:all`; politika öz testi, çekirdek/kritik testler, ESLint, production build ve yüksek önem düzeyindeki production dependency audit adımlarını çalıştırır.

## Android

Canonical Android proje kaynağı bu repository altındaki `android/` klasörüdür. Release niyeti `release/talkx-release.json` dosyasında tutulur.

```powershell
npm run mobile:version:check
npm run mobile:prepare:android
npm run mobile:verify:android-assets
```

Tam iç release doğrulama akışı:

```powershell
npm run mobile:release:package
```

Bu komutun ürettiği kısa ömürlü imzalı internal RC, Play upload key kullanmaz ve Google Play'e yüklenmez. Resmî mağaza paketi ve imza süreci için `docs/ANDROID_RELEASE_RUNBOOK.md` izlenir.

## Önemli yollar

- `src/`: React uygulaması ve ürün akışları
- `public/`: statik varlıklar ve release metadata
- `test/`: Node tabanlı kontrat/regresyon testleri
- `scripts/`: kalite ve Android release otomasyonu
- `android/`: Capacitor Android projesi
- `docs/`: ürün, görsel QA ve release rehberleri

## Deploy

Web istemcisi Render Static Site üzerinde `npm ci && npm run build` komutuyla derlenir; yayın dizini `dist` olur. SPA deep-link yönlendirmesi `/* -> /index.html` olarak yapılandırılır. Klasik Render Static Site kullanılıyorsa dashboard yönlendirmesi için `RENDER_CLASSIC_STATIC_FIX.md` dosyasına bakın.

## Güvenlik ve devir

- `.env`, keystore, upload key, service-account dosyası ve imzalı release çıktıları repository'ye eklenmez.
- Buyer-owned backend/Firebase değerleri kapanışta yeni ortam değişkenleriyle tanımlanır.
- Resmî Play transferi tamamlanmadan uygulama kimliği veya imza zinciri değiştirilmez.

Doğrudan bağımlılık lisans özeti için `THIRD_PARTY_NOTICES.md` dosyasına bakın.
