# Render Classic Static Site: `/privacy-policy` ve `/terms-of-use` 404 Fix

Bu proje React SPA oldugu icin deep-link URL'lerde static host rewrite gerekir.

## Neden 404 oluyor?

`https://www.talkx.chat/privacy-policy` istegi static site'e gider.
Static host fiziksel dosya arar:

- `/privacy-policy`
- `/privacy-policy/index.html`

Bulamazsa 404 doner. React route'a hic ulasamaz.

## Klasik Static Service (Blueprint yok) icin dogru cozum

Render Dashboard > ilgili Static Service > `Redirects/Rewrites`:

1. Source: `/privacy-policy`
   Destination: `/index.html`
   Action: `Rewrite`

2. Source: `/terms-of-use`
   Destination: `/index.html`
   Action: `Rewrite`

Kaydet, sonra manuel redeploy yap.

## Onemli notlar

- `service id` girmezsin.
- `talkx.chat` veya `onrender.com` URL'si girmezsin.
- `render.yaml` icindeki `name` sadece Blueprint sync icin anlamlidir.
- Klasik static service'te `render.yaml` degisikligi tek basina etkili olmaz.

## Kontrol checklist

1. `www.talkx.chat` hangi static service'e bagliysa rewrite kurallari O serviste.
2. `https://www.talkx.chat/privacy-policy` aciliyor.
3. `https://www.talkx.chat/terms-of-use` aciliyor.
4. Hard refresh sonrasi da 404 yok.
5. `?lang=tr` ve `?lang=en` dogru calisiyor.
