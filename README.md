# OpS Crypt LTC

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Litecoin](https://img.shields.io/badge/Network-Litecoin%20Mainnet-345c9c)](#)
[![BIP39](https://img.shields.io/badge/Standard-BIP39%20%2F%20BIP44%20%2F%20BIP84-informational)](#)

**Non-custodial Litecoin wallet** — create real keys, encrypt backups, send & receive on mainnet.

> **Author:** Joaquim Pedro de Morais Filho  
> **Web:** [USAcomment.com](https://usacomment.com) · **Email:** zicutake@mail.ru  

🌐 **Project website (EN / PT):** [elevbit-ai.github.io/ops-crypt-ltc](https://elevbit-ai.github.io/ops-crypt-ltc/)  
📦 **Repository:** [github.com/elevbit-ai/ops-crypt-ltc](https://github.com/elevbit-ai/ops-crypt-ltc)  

---

## English

### Features

| Feature | Description |
|--------|-------------|
| **BIP39 seed** | 12-word recovery phrase |
| **Addresses** | SegWit (`ltc1…`, BIP84) + Legacy (`L…`, BIP44) |
| **Backup** | Encrypted `.opsjson` (AES-256-GCM + PBKDF2) |
| **Import** | Seed, WIF, or backup upload |
| **Network APIs** | litecoinspace.org → BlockCypher → Blockchair |
| **Android** | Capacitor project for signed APK |

### Compatibility

| Wallet | Litecoin via BIP39 |
|--------|--------------------|
| Trust Wallet | ✅ Import seed, enable LTC |
| Exodus / multi-wallets | ✅ Usually |
| Electrum-LTC | ✅ Via WIF export |
| **MetaMask** | ❌ EVM only — **not** Litecoin |

### Quick start

```bash
git clone https://github.com/elevbit-ai/ops-crypt-ltc.git
cd ops-crypt-ltc
npm install
npm run dev
```

```bash
npm run build
npx cap sync android   # requires Android SDK for APK
```

### Security

- Private keys and seed never leave the device for signing
- APIs only receive public addresses and already-signed transactions
- **You** must back up the seed; lost PIN/seed cannot be recovered by the author

---

## Português

### Recursos

| Recurso | Descrição |
|--------|-----------|
| **Seed BIP39** | Frase de 12 palavras |
| **Endereços** | SegWit (`ltc1…`) + Legacy BIP44 (`L…`) |
| **Backup** | `.opsjson` criptografado (AES-256-GCM + PBKDF2) |
| **Importar** | Seed, WIF ou upload de backup |
| **APIs** | litecoinspace → BlockCypher → Blockchair |
| **Android** | Projeto Capacitor para APK assinado |

### Compatibilidade

| Carteira | Litecoin via BIP39 |
|----------|--------------------|
| Trust Wallet | ✅ Importar seed e ativar LTC |
| Exodus / multi-wallets | ✅ Em geral |
| Electrum-LTC | ✅ Via exportação WIF |
| **MetaMask** | ❌ Só EVM — **não** Litecoin |

### Início rápido

```bash
npm install
npm run dev
```

### Segurança

- Chaves não são enviadas a servidores
- Faça backup da seed offline
- O autor **não** recupera PIN ou seed perdidos

---

## Project layout

```
ops-crypt-ltc/
├── src/                 # Wallet source (Vite)
├── app/                 # Production web build output
├── android/             # Capacitor Android project
├── docs/                # Bilingual website (GitHub Pages)
├── documentation/       # APK / signing notes
├── website/             # Extra tutorial pages
└── package.json
```

## License

MIT © Joaquim Pedro de Morais Filho  

Litecoin® is a trademark of its respective owners.  
Not affiliated with MetaMask, Trust Wallet, or the Litecoin Foundation.
