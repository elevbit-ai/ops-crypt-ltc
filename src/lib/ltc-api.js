/**
 * Multi-provider Litecoin mainnet API layer
 * Fallbacks so balance / UTXO / broadcast keep working.
 */

const providers = {
  blockcypher: "https://api.blockcypher.com/v1/ltc/main",
  blockchair: "https://api.blockchair.com/litecoin",
  litecoinspace: "https://litecoinspace.org/api",
};

async function getJson(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Balance in litoshis (1 LTC = 1e8) */
export async function getBalance(address) {
  const errors = [];

  // 1) litecoinspace (mempool-style)
  try {
    const d = await getJson(`${providers.litecoinspace}/address/${address}`);
    const chain = d.chain_stats || {};
    const mem = d.mempool_stats || {};
    const funded = (chain.funded_txo_sum || 0) + (mem.funded_txo_sum || 0);
    const spent = (chain.spent_txo_sum || 0) + (mem.spent_txo_sum || 0);
    return {
      confirmed: Math.max(0, (chain.funded_txo_sum || 0) - (chain.spent_txo_sum || 0)),
      unconfirmed: Math.max(0, (mem.funded_txo_sum || 0) - (mem.spent_txo_sum || 0)),
      total: Math.max(0, funded - spent),
      source: "litecoinspace.org",
    };
  } catch (e) {
    errors.push(String(e.message || e));
  }

  // 2) BlockCypher
  try {
    const d = await getJson(`${providers.blockcypher}/addrs/${address}/balance`);
    return {
      confirmed: d.balance || 0,
      unconfirmed: d.unconfirmed_balance || 0,
      total: (d.balance || 0) + (d.unconfirmed_balance || 0),
      source: "blockcypher",
    };
  } catch (e) {
    errors.push(String(e.message || e));
  }

  // 3) Blockchair
  try {
    const d = await getJson(`${providers.blockchair}/dashboards/address/${address}`);
    const data = d.data && d.data[address];
    const bal = data?.address?.balance ?? 0;
    return {
      confirmed: bal,
      unconfirmed: 0,
      total: bal,
      source: "blockchair",
    };
  } catch (e) {
    errors.push(String(e.message || e));
  }

  throw new Error("APIs Litecoin indisponíveis: " + errors.join(" | "));
}

export async function getUtxos(address) {
  const errors = [];

  // litecoinspace
  try {
    const list = await getJson(`${providers.litecoinspace}/address/${address}/utxo`);
    if (Array.isArray(list)) {
      const utxos = [];
      for (const u of list) {
        let rawTxHex = null;
        try {
          rawTxHex = await fetch(
            `${providers.litecoinspace}/tx/${u.txid}/hex`
          ).then((r) => r.text());
        } catch {
          /* optional for segwit */
        }
        utxos.push({
          txid: u.txid,
          vout: u.vout,
          value: u.value,
          address,
          rawTxHex,
          confirmed: (u.status && u.status.confirmed) || false,
        });
      }
      return { utxos, source: "litecoinspace.org" };
    }
  } catch (e) {
    errors.push(String(e.message || e));
  }

  // BlockCypher
  try {
    const d = await getJson(
      `${providers.blockcypher}/addrs/${address}?unspentOnly=true&includeScript=true`
    );
    const refs = d.txrefs || d.unconfirmed_txrefs || [];
    const utxos = [];
    for (const u of refs) {
      let rawTxHex = null;
      try {
        const tx = await getJson(`${providers.blockcypher}/txs/${u.tx_hash}?includeHex=true`);
        rawTxHex = tx.hex;
      } catch {
        /* */
      }
      utxos.push({
        txid: u.tx_hash,
        vout: u.tx_output_n,
        value: u.value,
        script: u.script,
        address,
        rawTxHex,
      });
    }
    return { utxos, source: "blockcypher" };
  } catch (e) {
    errors.push(String(e.message || e));
  }

  throw new Error("Não foi possível listar UTXOs: " + errors.join(" | "));
}

export async function getTxHistory(address, limit = 20) {
  try {
    const d = await getJson(
      `${providers.blockcypher}/addrs/${address}?limit=${limit}`
    );
    return {
      txs: (d.txrefs || []).map((t) => ({
        txid: t.tx_hash,
        value: t.value,
        incoming: t.tx_input_n === -1,
        confirmations: t.confirmations || 0,
        time: t.confirmed || t.received,
      })),
      source: "blockcypher",
    };
  } catch {
    try {
      const d = await getJson(
        `${providers.litecoinspace}/address/${address}/txs`
      );
      const txs = (Array.isArray(d) ? d : []).slice(0, limit).map((t) => {
        let delta = 0;
        (t.vout || []).forEach((o) => {
          if (o.scriptpubkey_address === address) delta += o.value;
        });
        (t.vin || []).forEach((i) => {
          if (i.prevout && i.prevout.scriptpubkey_address === address) {
            delta -= i.prevout.value;
          }
        });
        return {
          txid: t.txid,
          value: Math.abs(delta),
          incoming: delta >= 0,
          confirmations: t.status?.confirmed ? 6 : 0,
          time: t.status?.block_time,
        };
      });
      return { txs, source: "litecoinspace.org" };
    } catch (e) {
      throw new Error("Histórico indisponível");
    }
  }
}

export async function broadcastTx(hex) {
  const errors = [];

  // litecoinspace
  try {
    const res = await fetch(`${providers.litecoinspace}/tx`, {
      method: "POST",
      body: hex,
      headers: { "Content-Type": "text/plain" },
    });
    const text = await res.text();
    if (res.ok && /^[a-f0-9]{64}$/i.test(text.trim())) {
      return { txid: text.trim(), source: "litecoinspace.org" };
    }
    // sometimes returns txid json
    if (res.ok) return { txid: text.trim(), source: "litecoinspace.org" };
    errors.push("space: " + text);
  } catch (e) {
    errors.push(String(e.message || e));
  }

  // BlockCypher
  try {
    const d = await getJson(`${providers.blockcypher}/txs/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tx: hex }),
    });
    if (d.tx && d.tx.hash) {
      return { txid: d.tx.hash, source: "blockcypher" };
    }
    errors.push("blockcypher: " + JSON.stringify(d));
  } catch (e) {
    errors.push(String(e.message || e));
  }

  // Blockchair
  try {
    const res = await fetch(`${providers.blockchair}/push/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(hex),
    });
    const d = await res.json();
    if (d.data && d.data.transaction_hash) {
      return { txid: d.data.transaction_hash, source: "blockchair" };
    }
    errors.push("blockchair: " + JSON.stringify(d));
  } catch (e) {
    errors.push(String(e.message || e));
  }

  throw new Error("Broadcast falhou: " + errors.join(" | "));
}

export async function getLtcUsdPrice() {
  try {
    const d = await getJson("https://api.coinbase.com/v2/prices/LTC-USD/spot");
    return parseFloat(d.data.amount);
  } catch {
    try {
      const d = await getJson(
        "https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd"
      );
      return d.litecoin.usd;
    } catch {
      return null;
    }
  }
}

export function satToLtc(sat) {
  return (sat / 1e8).toFixed(8);
}

export function ltcToSat(ltc) {
  return Math.round(parseFloat(ltc) * 1e8);
}
