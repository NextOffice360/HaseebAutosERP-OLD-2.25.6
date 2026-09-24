# ③ Configuration — Settings jo waqai kaam ki hain

Sab kuch **Settings** screen par hai (Har tab ka apna Save; header me **Save all** —
kitni bhi tabs badli hon, ek click me sab save, fail par sirf wohi section dirty rehta hai).

## Zaroori switches
| Setting | Kya karti hai | Default |
|---------|---------------|---------|
| `taxRate` + `taxInclusive` | Sale par tax %; inclusive = price ke andar tax | 17% / off |
| `maxDiscountPct` | Bill discount ki ceiling (%) | 30 |
| `allowCreditSale` | Customer ke baghair udhaar? | off |
| `loyalty.perAmount` / `points` / `rate` | Har Rs 100 par 1 point; point = Rs 1 | on |
| `loyalty.minRedeem` | Kam se kam kitne points redeem hon | 0 |
| `shop.requireOpen` | Bina Open Shop ke sale block (structured error) | on |
| `allowNegativeStock` | Stock me na ho to bhi sale? | off |
| `sync.autoFlush` | Offline queue khud flush (60s tick) | on |

## Shop sessions (cash ka hisab)
- **Open Shop**: opening cash → session OPEN (sale isi par chalti hai).
- **Close Shop**: counted cash daalo → `expected = opening + netCash` → **variance**
  (farq) report me. Variance 0 = hisab barabar.
- Day/Shift report PDF/print ke liye taiyar (cash sales / udhaar / refunds alag heads).

## Taxes — price ke andar ya upar?
- `taxInclusive = false` (recommended retail): Rs 500 + 17% = **Rs 585**.
- `taxInclusive = true`: Rs 585 ka tag = **Rs 500 + 85 tax** (backend khud nikaalta hai).
- Item par apna `taxRate` (0 = tax-free item) — bill me per-line lagta hai.
- Bill discount har line par **proportionally** banta hai (residue aakhri line) — isi liye
  line-totals ka sum hamesha bill total ke barabar rehta hai (0.02 drift guard).

## Loyalty
- Earn: `floor(total / perAmount) × points` (DOWN rounding — 1296/100 → 12).
- Redeem: POS me **LOYALTY** method ya Points modal se; ledger dono taraf record karta hai.
- Note: redeem par **double receipt nahi** banta (N11-audit verified).

## Users / roles
- `Users & Security` tab: role banao → permission keys on/off → user ko role do.
- Field-visibility matrix (W5): kis role ko kaun sa field nazar aaye — backend-enforced.
