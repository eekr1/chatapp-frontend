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

## Production build

```powershell
npm run build
```

Satış öncesi test ve kabul kanıtları kaynak arşivinden ayrı olarak due-diligence dosyalarında tutulur.

## Android

Canonical Android proje kaynağı bu repository altındaki `android/` klasörüdür. Uygulama kimliği `com.talkx.app`, release metadata kaynağı `release/talkx-release.json` dosyasıdır.

```powershell
npm run mobile:version:check
npm run mobile:prepare:android
npm run mobile:verify:android-assets
```

Resmî mağaza paketi Android Studio üzerinden `release` varyantıyla hazırlanır. Play upload key ve parolaları kaynak arşivine dahil değildir; resmî Play transferi sırasında mevcut imza zinciri korunur.

## Önemli yollar

- `src/`: React uygulaması ve ürün akışları
- `public/`: statik varlıklar ve release metadata
- `scripts/`: ürün ve Android release yardımcıları
- `android/`: Capacitor Android projesi
- `release/`: sürüm metadata kaynağı

## Deploy

Web istemcisi Render Static Site üzerinde `npm ci && npm run build` komutuyla derlenir; yayın dizini `dist` olur. SPA deep-link yönlendirmesi `/* -> /index.html` olarak yapılandırılır.

## Güvenlik ve devir

- `.env`, keystore, upload key, service-account dosyası ve imzalı release çıktıları repository'ye eklenmez.
- Buyer-owned backend/Firebase değerleri kapanışta yeni ortam değişkenleriyle tanımlanır.
- Resmî Play transferi tamamlanmadan uygulama kimliği veya imza zinciri değiştirilmez.

Doğrudan bağımlılık lisans özeti için `THIRD_PARTY_NOTICES.md` dosyasına bakın.
Kaynak arşivinin kapsamı için `SOURCE_PACKAGE_NOTE.md` dosyasına bakın.
