import * as bip39 from "bip39";
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";
import { payments, Psbt, address as baddress } from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import { LITECOIN, PATHS } from "./networks.js";

const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

export function generateMnemonic(strength = 128) {
  return bip39.generateMnemonic(strength);
}

export function validateMnemonic(m) {
  return bip39.validateMnemonic((m || "").trim().toLowerCase());
}

function seedFromMnemonic(mnemonic, passphrase = "") {
  return bip39.mnemonicToSeedSync(mnemonic.trim().toLowerCase(), passphrase);
}

function deriveNode(mnemonic, path, passphrase = "") {
  const seed = seedFromMnemonic(mnemonic, passphrase);
  const root = bip32.fromSeed(seed, LITECOIN);
  return root.derivePath(path);
}

export function walletFromMnemonic(mnemonic, passphrase = "") {
  if (!validateMnemonic(mnemonic)) {
    throw new Error("Frase-semente BIP39 inválida");
  }
  const m = mnemonic.trim().toLowerCase();

  const node44 = deriveNode(m, PATHS.bip44, passphrase);
  const node84 = deriveNode(m, PATHS.bip84, passphrase);

  const legacy = payments.p2pkh({
    pubkey: node44.publicKey,
    network: LITECOIN,
  });
  const segwit = payments.p2wpkh({
    pubkey: node84.publicKey,
    network: LITECOIN,
  });

  return {
    mnemonic: m,
    passphrase: passphrase || "",
    // Default receive: native segwit (modern)
    address: segwit.address,
    addressLegacy: legacy.address,
    addressSegwit: segwit.address,
    pathDefault: PATHS.bip84,
    pathLegacy: PATHS.bip44,
    wif: node84.toWIF(),
    wifLegacy: node44.toWIF(),
    publicKeyHex: Buffer.from(node84.publicKey).toString("hex"),
    network: "litecoin-mainnet",
    standard: "BIP39 + BIP84/BIP44 coin_type=2",
    compatibleWith: [
      "Trust Wallet (import seed BIP39)",
      "Exodus (seed)",
      "Atomic / many multi-wallets",
      "Electrum-LTC (via WIF or converted seed)",
      "OpS Crypt LTC",
    ],
    notCompatible: [
      "MetaMask (only Ethereum/EVM — does not support Litecoin)",
    ],
  };
}

export function walletFromWIF(wif) {
  const key = ECPair.fromWIF(wif.trim(), LITECOIN);
  const legacy = payments.p2pkh({
    pubkey: key.publicKey,
    network: LITECOIN,
  });
  let segwit = null;
  try {
    segwit = payments.p2wpkh({
      pubkey: key.publicKey,
      network: LITECOIN,
    });
  } catch {
    /* ignore */
  }
  return {
    mnemonic: null,
    wif: key.toWIF(),
    address: segwit?.address || legacy.address,
    addressLegacy: legacy.address,
    addressSegwit: segwit?.address || null,
    pathDefault: "WIF-import",
    network: "litecoin-mainnet",
    standard: "WIF",
    compatibleWith: ["Any wallet that imports Litecoin WIF"],
    notCompatible: ["MetaMask"],
  };
}

export function isValidLtcAddress(addr) {
  try {
    baddress.toOutputScript(addr.trim(), LITECOIN);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build & sign a simple send tx (prefer segwit UTXOs, fallback all)
 * utxos: [{ txid, vout, value, script? }]
 */
export function buildSignedTx({
  wif,
  utxos,
  toAddress,
  amountSat,
  changeAddress,
  feeSat,
}) {
  const key = ECPair.fromWIF(wif, LITECOIN);
  const totalIn = utxos.reduce((s, u) => s + u.value, 0);
  const change = totalIn - amountSat - feeSat;
  if (change < 0) throw new Error("Saldo insuficiente (inclua taxa de rede)");

  const psbt = new Psbt({ network: LITECOIN });

  for (const u of utxos) {
    const isSegwit =
      (u.script && (u.script.startsWith("0014") || u.script.startsWith("0020"))) ||
      (u.address && u.address.startsWith("ltc1"));

    if (isSegwit) {
      const p2wpkh = payments.p2wpkh({
        pubkey: key.publicKey,
        network: LITECOIN,
      });
      psbt.addInput({
        hash: u.txid,
        index: u.vout,
        witnessUtxo: {
          script: p2wpkh.output,
          value: u.value,
        },
      });
    } else {
      if (!u.rawTxHex) {
        throw new Error("UTXO legacy precisa de rawTxHex — tente de novo");
      }
      psbt.addInput({
        hash: u.txid,
        index: u.vout,
        nonWitnessUtxo: Buffer.from(u.rawTxHex, "hex"),
      });
    }
  }

  psbt.addOutput({ address: toAddress, value: amountSat });
  if (change >= 546) {
    psbt.addOutput({ address: changeAddress, value: change });
  }

  utxos.forEach((_, i) => {
    psbt.signInput(i, key);
  });
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();
  return {
    hex: tx.toHex(),
    txid: tx.getId(),
    feeSat,
    vsize: tx.virtualSize(),
  };
}

export function estimateFee(numInputs, numOutputs, satPerVByte = 10) {
  // rough vbytes: segwit ~68 in, 31 out + 10 overhead
  const vbytes = numInputs * 68 + numOutputs * 31 + 10;
  return Math.max(200, Math.ceil(vbytes * satPerVByte));
}
