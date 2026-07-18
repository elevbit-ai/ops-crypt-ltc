import QRCode from "qrcode";
import { CREATOR } from "./lib/networks.js";
import {
  generateMnemonic,
  walletFromMnemonic,
  walletFromWIF,
  validateMnemonic,
  isValidLtcAddress,
  buildSignedTx,
  estimateFee,
} from "./lib/wallet.js";
import {
  getBalance,
  getUtxos,
  getTxHistory,
  broadcastTx,
  getLtcUsdPrice,
  satToLtc,
  ltcToSat,
} from "./lib/ltc-api.js";
import { encryptVault, decryptVault, pinHash } from "./lib/crypto-vault.js";

const STORE_KEY = "ops_crypt_ltc_vault_v2";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let pin = "";
let wallet = null; // runtime wallet object
let vaultMeta = null; // { pinHash, blob }

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._x);
  t._x = setTimeout(() => t.classList.remove("show"), 2800);
}

function show(view) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  const el = document.getElementById("view-" + view);
  if (el) el.classList.add("active");
}

function short(a) {
  return a ? a.slice(0, 10) + "…" + a.slice(-8) : "…";
}

function loadStored() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveStored(obj) {
  localStorage.setItem(STORE_KEY, JSON.stringify(obj));
}

async function persistWallet(w, userPin) {
  const payload = {
    mnemonic: w.mnemonic,
    passphrase: w.passphrase || "",
    wif: w.wif,
    wifLegacy: w.wifLegacy || null,
    address: w.address,
    addressLegacy: w.addressLegacy,
    addressSegwit: w.addressSegwit,
    createdAt: new Date().toISOString(),
    creator: CREATOR,
  };
  const blob = await encryptVault(payload, userPin);
  const ph = await pinHash(userPin);
  saveStored({ pinHash: ph, blob, version: 2 });
  wallet = { ...w, ...payload };
}

async function unlockWithPin(userPin) {
  const stored = loadStored();
  if (!stored) return false;
  const ph = await pinHash(userPin);
  if (ph !== stored.pinHash) throw new Error("PIN incorreto");
  const data = await decryptVault(stored.blob, userPin);
  if (data.mnemonic) {
    wallet = walletFromMnemonic(data.mnemonic, data.passphrase || "");
  } else if (data.wif) {
    wallet = walletFromWIF(data.wif);
    if (data.addressLegacy) wallet.addressLegacy = data.addressLegacy;
  } else {
    throw new Error("Vault inválido");
  }
  pin = userPin;
  return true;
}

function enterApp() {
  show("home");
  renderHome();
  refreshAll();
}

function renderHome() {
  if (!wallet) return;
  $("#addr").textContent = short(wallet.addressSegwit || wallet.address);
  $("#addr-leg").textContent = short(wallet.addressLegacy || wallet.address);
  $("#api-source").textContent = "LTC Mainnet · APIs ao vivo";
}

async function refreshAll() {
  if (!wallet) return;
  const addr = wallet.addressSegwit || wallet.address;
  const addrLeg = wallet.addressLegacy || addr;
  $("#bal").innerHTML = "… <small>LTC</small>";
  try {
    // sum both addresses (segwit + legacy) so Trust-style deposits count
    const b1 = await getBalance(addr);
    let total = b1.total;
    let source = b1.source;
    if (addrLeg && addrLeg !== addr) {
      try {
        const b2 = await getBalance(addrLeg);
        total += b2.total;
        source += "+" + b2.source;
      } catch {
        /* */
      }
    }
    $("#bal").innerHTML = `${satToLtc(total)} <small>LTC</small>`;
    $("#api-source").textContent = `Mainnet · ${source}`;
    const px = await getLtcUsdPrice();
    if (px != null) {
      $("#fiat").textContent = `≈ $${((total / 1e8) * px).toFixed(2)} USD`;
    }
  } catch (e) {
    $("#bal").innerHTML = "— <small>LTC</small>";
    toast(e.message || "Falha ao ler saldo");
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copiado");
  } catch {
    prompt("Copie:", text);
  }
}

async function paintQr(text) {
  const el = $("#qr");
  el.innerHTML = "";
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, text, {
    width: 200,
    margin: 1,
    color: { dark: "#0a0a12", light: "#ffffff" },
  });
  el.appendChild(canvas);
}

// —— Onboarding ——
const stored = loadStored();
if (stored) {
  $("#pin2").classList.add("hidden");
  $("#lock-hint").textContent = "Digite seu PIN para desbloquear a carteira.";
} else {
  $("#pin2").classList.remove("hidden");
}

$("#btn-pin-next").onclick = async () => {
  const p1 = $("#pin").value.trim();
  const p2 = $("#pin2").value.trim();
  if (!/^\d{6}$/.test(p1)) return toast("PIN deve ter 6 dígitos");

  if (stored) {
    try {
      await unlockWithPin(p1);
      pin = p1;
      enterApp();
    } catch (e) {
      toast(e.message || "PIN incorreto");
    }
    return;
  }

  if ($("#pin2").classList.contains("hidden") === false) {
    if (p1 !== p2) return toast("PINs não coincidem");
  }
  pin = p1;
  $("#step-pin").classList.add("hidden");
  $("#step-create").classList.remove("hidden");
};

$("#btn-new").onclick = async () => {
  const mnemonic = generateMnemonic(128);
  const w = walletFromMnemonic(mnemonic);
  const words = mnemonic.split(" ");
  const grid = $("#seed-grid");
  grid.innerHTML = words
    .map((wrd, i) => `<span><i>${i + 1}.</i>${wrd}</span>`)
    .join("");
  $("#step-create").classList.add("hidden");
  $("#step-seed-show").classList.remove("hidden");
  $("#seed-confirm").checked = false;
  $("#btn-seed-done").disabled = true;
  wallet = w;
  window.__pendingMnemonic = mnemonic;
};

$("#seed-confirm").onchange = (e) => {
  $("#btn-seed-done").disabled = !e.target.checked;
};

$("#btn-seed-done").onclick = async () => {
  try {
    const w = walletFromMnemonic(window.__pendingMnemonic);
    await persistWallet(w, pin);
    window.__pendingMnemonic = null;
    toast("Carteira criada e criptografada");
    enterApp();
  } catch (e) {
    toast(e.message);
  }
};

function openImport(mode) {
  $("#step-create").classList.add("hidden");
  $("#step-import").classList.remove("hidden");
  $("#import-text").value = "";
  if (mode === "seed") {
    $("#import-hint").textContent = "Cole a frase BIP39 (12 ou 24 palavras). Compatível com Trust Wallet.";
    $("#import-pass").classList.remove("hidden");
    $("#btn-import-go").dataset.mode = "seed";
  } else {
    $("#import-hint").textContent = "Cole a chave privada WIF Litecoin (começa com T ou 6…).";
    $("#import-pass").classList.add("hidden");
    $("#btn-import-go").dataset.mode = "wif";
  }
}

$("#btn-import-seed").onclick = () => openImport("seed");
$("#btn-import-wif").onclick = () => openImport("wif");
$("#btn-import-cancel").onclick = () => {
  $("#step-import").classList.add("hidden");
  $("#step-create").classList.remove("hidden");
};

$("#btn-import-go").onclick = async () => {
  const mode = $("#btn-import-go").dataset.mode;
  const text = $("#import-text").value.trim();
  try {
    let w;
    if (mode === "seed") {
      if (!validateMnemonic(text)) throw new Error("Frase BIP39 inválida");
      w = walletFromMnemonic(text, $("#import-pass").value || "");
    } else {
      w = walletFromWIF(text);
    }
    await persistWallet(w, pin);
    toast("Carteira importada");
    enterApp();
  } catch (e) {
    toast(e.message || "Falha na importação");
  }
};

$("#btn-upload-backup").onclick = () => $("#file-backup").click();
$("#file-backup").onchange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    // backup file is the encrypted vault JSON or wrapped
    let data;
    try {
      data = await decryptVault(text, pin);
    } catch {
      // maybe { blob: "..." }
      const wrap = JSON.parse(text);
      if (wrap.blob) data = await decryptVault(wrap.blob, pin);
      else throw new Error("Não foi possível descriptografar — confira o PIN");
    }
    let w;
    if (data.mnemonic) w = walletFromMnemonic(data.mnemonic, data.passphrase || "");
    else if (data.wif) w = walletFromWIF(data.wif);
    else throw new Error("Backup sem seed/WIF");
    await persistWallet(w, pin);
    toast("Backup restaurado");
    enterApp();
  } catch (err) {
    toast(err.message || "Upload inválido");
  }
};

// —— Navigation ——
$$("[data-go]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const go = btn.getAttribute("data-go");
    if (go === "receive") {
      show("receive");
      const a = wallet.addressSegwit || wallet.address;
      $("#recv-addr").textContent = a;
      $$(".tab").forEach((t) => t.classList.toggle("on", t.dataset.recv === "segwit"));
      await paintQr(a);
    } else if (go === "history") {
      show("history");
      loadHistory();
    } else if (go === "send") {
      show("send");
      $("#send-log").textContent = "";
    } else if (go === "backup") {
      show("backup");
    } else if (go === "home") {
      show("home");
    }
  });
});

$("#btn-settings").onclick = () => show("settings");

$$(".tab").forEach((tab) => {
  tab.onclick = async () => {
    $$(".tab").forEach((t) => t.classList.remove("on"));
    tab.classList.add("on");
    const a =
      tab.dataset.recv === "legacy"
        ? wallet.addressLegacy || wallet.address
        : wallet.addressSegwit || wallet.address;
    $("#recv-addr").textContent = a;
    await paintQr(a);
  };
});

$("#copy-addr").onclick = () => copy(wallet.addressSegwit || wallet.address);
$("#copy-leg").onclick = () => copy(wallet.addressLegacy || wallet.address);
$("#recv-copy").onclick = () => copy($("#recv-addr").textContent);
$("#btn-refresh").onclick = () => {
  refreshAll();
  toast("Atualizando…");
};

async function loadHistory() {
  const box = $("#tx-list");
  box.innerHTML = '<p class="muted">Carregando…</p>';
  try {
    const addr = wallet.addressSegwit || wallet.address;
    const { txs, source } = await getTxHistory(addr);
    if (!txs.length) {
      box.innerHTML = '<p class="muted">Sem transações neste endereço SegWit. Legacy pode ter histórico separado.</p>';
      return;
    }
    box.innerHTML = txs
      .map(
        (t) =>
          `<div class="tx-item"><div><span class="${t.incoming ? "in" : "out"}">${
            t.incoming ? "↓ Recebido" : "↑ Enviado"
          }</span><br/><span class="muted">${t.confirmations} conf · ${source}</span></div><div><strong>${
            t.incoming ? "+" : "-"
          }${satToLtc(t.value)}</strong></div></div>`
      )
      .join("");
  } catch (e) {
    box.innerHTML = `<p class="muted">${e.message}</p>`;
  }
}

$("#btn-send").onclick = async () => {
  const log = $("#send-log");
  const write = (m) => {
    log.textContent += m + "\n";
  };
  log.textContent = "";
  const to = $("#send-to").value.trim();
  const amt = parseFloat($("#send-amt").value);
  const feeRate = parseInt($("#send-fee-rate").value, 10) || 12;

  if (!isValidLtcAddress(to)) return toast("Endereço LTC inválido");
  if (!(amt > 0)) return toast("Valor inválido");

  try {
    write("Buscando UTXOs (APIs Litecoin)…");
    // gather UTXOs from both addresses
    const addresses = [
      wallet.addressSegwit || wallet.address,
      wallet.addressLegacy,
    ].filter(Boolean);
    let utxos = [];
    let wifForInput = wallet.wif;

    for (const a of [...new Set(addresses)]) {
      try {
        const { utxos: u, source } = await getUtxos(a);
        write(`UTXOs ${a.slice(0, 8)}… via ${source}: ${u.length}`);
        u.forEach((x) => {
          x._from = a;
          // if legacy address UTXO, sign with legacy key
          if (a === wallet.addressLegacy && wallet.wifLegacy) {
            x._wif = wallet.wifLegacy;
          } else {
            x._wif = wallet.wif;
          }
        });
        utxos = utxos.concat(u);
      } catch (e) {
        write("warn: " + e.message);
      }
    }

    if (!utxos.length) throw new Error("Sem UTXOs (saldo zero ou API offline)");

    // Prefer single-key UTXOs: if mixed keys, only use ones matching one wif
    // Simple strategy: sort by value desc, pick greedily with same key as first
    utxos.sort((a, b) => b.value - a.value);
    wifForInput = utxos[0]._wif || wallet.wif;
    utxos = utxos.filter((u) => (u._wif || wallet.wif) === wifForInput);

    const amountSat = ltcToSat(amt);
    let selected = [];
    let sum = 0;
    for (const u of utxos) {
      selected.push(u);
      sum += u.value;
      const fee = estimateFee(selected.length, 2, feeRate);
      if (sum >= amountSat + fee) break;
    }
    const feeSat = estimateFee(selected.length, 2, feeRate);
    if (sum < amountSat + feeSat) {
      throw new Error(
        `Saldo insuficiente: tem ${satToLtc(sum)} LTC, precisa ${satToLtc(
          amountSat + feeSat
        )} (c/ taxa)`
      );
    }

    write(`Selecionados ${selected.length} inputs · taxa ~${feeSat} sat`);
    const changeAddress =
      wifForInput === wallet.wifLegacy
        ? wallet.addressLegacy
        : wallet.addressSegwit || wallet.address;

    const signed = buildSignedTx({
      wif: wifForInput,
      utxos: selected,
      toAddress: to,
      amountSat,
      changeAddress,
      feeSat,
    });
    write("Tx assinada: " + signed.txid);
    write("Transmitindo…");
    const { txid, source } = await broadcastTx(signed.hex);
    write(`OK via ${source}\nTXID: ${txid}`);
    toast("Litecoin enviado");
    setTimeout(refreshAll, 2500);
  } catch (e) {
    write("ERRO: " + (e.message || e));
    toast(e.message || "Falha no envio");
  }
};

// Backup actions
$("#btn-download-backup").onclick = async () => {
  const stored = loadStored();
  if (!stored) return toast("Nada para exportar");
  const file = {
    product: "OpS Crypt LTC",
    version: 2,
    creator: CREATOR,
    exportedAt: new Date().toISOString(),
    note: "Encrypted vault. Decrypt only with your PIN inside OpS Crypt.",
    pinHash: stored.pinHash,
    blob: stored.blob,
  };
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ops-crypt-ltc-backup-${Date.now()}.opsjson`;
  a.click();
  toast("Backup baixado");
};

function reveal(title, value) {
  if (!confirm(title + "\n\nTem certeza? Ninguém deve ver a tela.")) return;
  prompt(title, value || "(indisponível — importe por seed)");
}

$("#btn-show-seed").onclick = () => {
  if (!wallet?.mnemonic) return toast("Esta carteira foi importada só por WIF");
  reveal("Frase-semente BIP39", wallet.mnemonic);
};
$("#btn-show-wif").onclick = () => reveal("WIF SegWit (BIP84)", wallet.wif);
$("#btn-show-wif-leg").onclick = () =>
  reveal("WIF Legacy (BIP44 / Trust)", wallet.wifLegacy || wallet.wif);

$("#btn-wipe").onclick = () => {
  if (!confirm("Apagar carteira local? Tenha o backup .opsjson ou seed!")) return;
  localStorage.removeItem(STORE_KEY);
  location.reload();
};

// PWA
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

console.info(
  `${CREATOR.product} by ${CREATOR.name} · ${CREATOR.site} · ${CREATOR.email}`
);
