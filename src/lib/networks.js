/** Litecoin mainnet — standard params used by Trust Wallet / Electrum-LTC / bitcoinjs */
export const LITECOIN = {
  messagePrefix: "\x19Litecoin Signed Message:\n",
  bech32: "ltc",
  bip32: {
    public: 0x019da462,
    private: 0x019d9cfe,
  },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
};

/** SLIP-0044 coin type for Litecoin */
export const LTC_COIN_TYPE = 2;

/**
 * Paths interoperable with major wallets:
 * - Trust Wallet / many mobile: BIP44 m/44'/2'/0'/0/0 (legacy L...)
 * - Modern wallets: BIP84 m/84'/2'/0'/0/0 (native segwit ltc1...)
 * MetaMask does NOT support Litecoin (EVM only).
 */
export const PATHS = {
  bip44: "m/44'/2'/0'/0/0",
  bip84: "m/84'/2'/0'/0/0",
  bip49: "m/49'/2'/0'/0/0",
};

export const CREATOR = {
  name: "Joaquim Pedro de Morais Filho",
  site: "https://usacomment.com",
  email: "zicutake@mail.ru",
  product: "OpS Crypt LTC",
  version: "2.0.0",
};
