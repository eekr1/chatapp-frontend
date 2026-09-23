# Wave 03 Client State Ownership

Bu kayıt mevcut davranışı dondurur; yeni ürün akışı tanımlamaz.

| Alan | Sahiplik | Reset sınırı |
|---|---|---|
| App shell/navigation | `screen`, modal/back/deep-link önceliği | Logout/session end: auth ekranı; transient back: home/friends |
| Auth/session | user, token ve auth notice | Logout/password change/session revoke: tamamı temizlenir |
| Realtime connection | socket phase, reconnect ve event dispatch | Logout/session revoke: socket, retry ve in-flight temizlenir |
| Match | queue/offer/anon room ve anon mesajlar | Leave/logout/session revoke: match alanı temizlenir |
| Friend chat | active friend, persistent mesaj/outbox/unread | Leave: active chat; logout: tamamı temizlenir |
| System | admin notice/toast | Süre sonu veya kullanıcı kapatması |
| Legal | public içerik ve reaccept modalı | Başarılı accept/logout ile kapanır |
| Push/permission | native token, permission onboarding ve delivery intent | Logout token unregister; back önce açık modalı kapatır |

Back önceliği: permission modalı → legal route → auth exit policy → image viewer → chat/matching leave → friends/home → app exit policy.

Realtime eventler `match`, `friend`, `system`, `media` ve `connection` alanlarına ayrılır. Friend chat açıkken gecikmiş match eventleri friend state'ini değiştiremez.

`localStorage` session token modeli Wave 03'te değiştirilmez. Token yalnız mevcut Wave 02 session sözleşmesinin client taşıyıcısıdır; logout, password change ve session revoke sonucunda temizlenir.
