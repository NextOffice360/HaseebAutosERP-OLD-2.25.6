# Teen mobile PWA — har app ka apna URL

Haseeb Autos v2.6 mein **3 mobile apps** hain. Ek hi Apps Script deployment se
**3 alag URL** milte hain — har app ka apna naam, apna icon, apni screen.

---

## 1. Pehle deploy karein (ek dafa)

1. [script.google.com](https://script.google.com) kholein → apna **Haseeb Autos** project
2. **Deploy → New deployment** → gear icon → **Web app**
3. **Execute as:** Me · **Who has access:** *(apni pasand — staff ke liye "Anyone with Google account")*
4. **Deploy** dabayein → Web app URL milega, jaisay:

```
https://script.google.com/a/macros/yourdomain.com/s/AKfycb………/exec
```

Is ko `BASE_URL` samajh lein. Neeche har jagah `BASE_URL` ki jagah ye paste karein.

---

## 2. Teen URL

| App | URL | Kis ke liye |
|---|---|---|
| 🏬 **Warehouse** | `BASE_URL?app=wh` | Godaam staff — maal receive, bin mein rakhna, counting |
| 🧾 **Field Orders** | `BASE_URL?app=fo` | Order lene wala — market mein, **bina net ke bhi** |
| 🚚 **Salesman** | `BASE_URL?app=sm` | Route par salesman — mera stock, bechna, udhaar wasooli |
| 💻 **Poori ERP** | `BASE_URL` | Office / desktop (koi `?app=` nahi) |

Har app ka apna `<title>`, `theme-color`, manifest aur icon hai — is liye phone
par install karne ke baad **home screen par 3 alag apps** nazar aayenge.

---

## 3. Phone par install kaise karein

### Android (Chrome)
1. Chrome mein app ka URL kholein (masalan `BASE_URL?app=fo`)
2. Upar daen taraf **⋮ → "Install app"** ya **"Add to Home screen"**
3. Icon home screen par aa jayega — aam app ki tarah chale ga

### iPhone (Safari)
1. Safari mein URL kholein
2. Neeche **Share ↗ → "Add to Home Screen"**
3. Naam theek kar ke **Add** dabayein

> Har staff member ke phone par **apni zaroorat wali app hi** install karein
> (salesman ko sirf `?app=sm`, godaam wale ko sirf `?app=wh`).

---

## 4. Bina net ke kaise chalta hai

Field mein net chala jaye to app **kaam karna rokta nahi**:

1. Order / entry phone ke **localStorage** mein save ho jati hai
2. Upar daen taraf `⌛ 3 queued` nazar aata hai (kitni entries baqi hain)
3. Net aate hi (ya neeche **↻ Sync** daba kar) sab entries server par chali jati hain
4. Sync ke baad `● Online` ho jata hai

**Do dafa sync se double order nahi banta** — har entry ke sath `clientId` jata
hai, server ek hi `clientId` ko do dafa nahi likhta (idempotent).

Agar queue mein koi entry ghalat ho to **sirf woh** fail hoti hai; baqi sab sync
ho jati hain (partial-failure safe).

---

## 5. Pehli baar chalane se pehle (ek dafa, zaroori)

1. `BASE_URL` (poori ERP) kholein
2. **Settings → Data & tools → Maintenance → 🧰 Repair / upgrade sheets**
3. Ye naye sheets aur columns bana deta hai — **koi row delete nahi hoti**

Is mein ye sab shamil hain:
- `DayReports` — auto shop open/close reports (§7)
- `Orders.clientId` — offline idempotency (§11)
- Salesman sheets (§12)

---

## 6. Apps on/off karna

**Settings → ⚙ → 📱 Mobile apps (PWA)**

| Setting | Default | Kya karti hai |
|---|---|---|
| Warehouse app (`?app=wh`) | **On** | Band karen to `?app=wh` khulne par message: "Warehouse PWA band hai" |
| Field Orders app (`?app=fo`) | **On** | Band karen to field app band |
| Salesman app (`?app=sm`) | **On** | Band karen to salesman app band |
| Offline kaam chaloo rahe | **On** | Band karen to bina net ke entry save nahi hogi |
| Queue ki had | **200** | Itni entries ke baad user ko sync ka message |

---

## 7. Har app kya karti hai

### 🏬 Warehouse (`?app=wh`)
| Tab | Kaam |
|---|---|
| **Receive** | PO dekho → item scan karo → qty → **GRN receive** (stock foran update) |
| **Put-away** | Bin chuno → item scan → **Bin mein dalen** |
| **Count** | Count sheet chuno → item scan → counted qty (diff auto calculate) |
| **Transfer** | From bin / To bin → item scan → **Transfer** |

### 🧾 Field Orders (`?app=fo`)
| Tab | Kaam |
|---|---|
| **New order** | Customer (ya naya naam) → items scan → qty → discount → **Order save** |
| **Pending** | Abhi tak ke orders + offline queue + **↻ Sync** |
| **Synced** | Confirm / invoiced ho chuke orders |

### 🚚 Salesman (`?app=sm`)
| Tab | Kaam |
|---|---|
| **My stock** | Mere zimme kitna maal hai (qty + cost value) |
| **Sell** | Items → qty → cash mila → **Sale complete** (consignment stock se ghatti hai) |
| **Collect** | Customer chuno → amount → **Receive** (udhaar wasooli) |
| **Settle** | Bacha hua stock ki value + offline queue |

> Salesman ka poora hisaab (issue → sale → return → settlement) ERP ke andar
> **Salesman** screen par hota hai — mobile app roz-marra ke kaam ke liye hai.

---

## 8. Aksar poochhe jane wale sawal

**Sawal: 3 alag deployment banane honge?**
Nahi. Ek deployment se 3 URL chalte hain (`?app=` se routing hoti hai).
Agar chahain to 3 alag copy deploy kar ke 3 Mukammal alag URL bhi le sakte hain.

**Sawal: App offline poori tarah chalti hai?**
Kaam **save** hota hai (order/entry queue mein jati hai) — lekin item ki list aur
purane orders dikhane ke liye net chahiye. Ye Apps Script ki hadd hai:
`script.google.com` par service worker host nahi ho sakta. Apni domain ya
Firebase par host karenge to poori offline (SW ke sath) bhi chal jayegi.

**Sawal: Ek staff member ko sab apps nazar aa rahi hain?**
URL ke zariye to sab khul sakti hain, lekin **permissions** lagu rehti hain —
jis role ke paas `stock.view` nahi, wo Warehouse app nahi khol sakta.
Behtar ye hai ke har phone par sirf zaroori wali app install karein.

**Sawal: Icon / naam badalna hai?**
`apps-script/Pwa.gs` mein `Pwa.APPS` mein har app ka `name`, `shortName`,
`icon`, `theme` likha hai — wahan badlein, dobara deploy karein.
Icon ke liye `tools/icon-192.png` / `icon-512.png` replace kar ke
`Pwa_Icons.gs` dobara generate karein.

---

## 9. Agar koi app na khule

| Alamat | Wajah | Hal |
|---|---|---|
| "… PWA band hai" | Settings se band | Settings → 📱 Mobile apps → On karein |
| "Aap ko … app ka access nahi hai" | Permission nahi | Users/Groups mein role check karein |
| "Pehle sheets repair karein" | Naye columns nahi bane | Settings → Data & tools → 🧰 Repair |
| Safed screen | Template deploy nahi hua | Deploy → **Manage deployments → Edit → New version** |
| Item list khaali | Catalog import nahi hua | Settings → Data & tools → CSV import |
