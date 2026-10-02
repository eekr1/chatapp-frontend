# TalkX Frontend Kaynak Paketi

Bu arşiv, TalkX web istemcisinin ve canonical Capacitor Android projesinin alıcıya devredilecek çalıştırılabilir kaynak paketidir.

## Bilinçli olarak dahil edilmeyenler

- İç test ve regresyon klasörleri
- Wave durumları ve tarihsel geliştirme notları
- CI/quality gate tanımları ve görsel inceleme kanıtları
- `.env`, keystore, upload key, parola ve imzalı APK/AAB çıktıları
- `node_modules`, build çıktıları ve yerel cache dosyaları

Bu öğelerin hariç tutulması ürün kaynak kodunu veya normal build akışını değiştirmez. Satış öncesi test sonuçları ve teknik doğrulama kanıtları ayrı due-diligence dosyalarında sunulur.

## Başlangıç

1. `.env.example` dosyasını `.env` olarak kopyalayın.
2. Buyer-owned backend adreslerini tanımlayın.
3. `npm ci` çalıştırın.
4. Yerel web için `npm run dev`, production build için `npm run build` kullanın.

Android projesi `android/` klasöründedir. Paket kimliği ve Play imza zinciri, resmî uygulama transferi tamamlanırken korunmalıdır.

Bağımlılık ve lisans özeti için `THIRD_PARTY_NOTICES.md` dosyasına bakın.
