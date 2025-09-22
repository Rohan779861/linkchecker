# 🔗 Link Checker (Node.js)

A simple **command-line tool** that fetches a webpage, extracts all links (`<a href="...">`), and checks whether they are **valid, broken, or returning errors**.  
Built in **TypeScript** and compiled to Node.js JavaScript.

---

## 🚀 Features
- Extracts **all unique links** from a webpage.
- Handles **relative, absolute, and protocol-relative** URLs.
- Skips irrelevant links (`mailto:`, `javascript:`, `tel:`).
- Uses **HEAD requests first** (fast), falls back to GET if needed.
- Detects:
  - ✅ OK (status 200)
  - ❌ NOT OK (HTTP status 400+)
  - ⚠️ ERROR (DNS errors, timeouts, unknown errors)
- Concurrency-limited with **p-limit** (default max = 200).

---

### 
```bash
git clone https://github.com/RLuciferG/linkchecker.git
cd link-checker
npm install
npm run build
node dist/linkchecker.js <url>
# linkchecker
