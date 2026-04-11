import type { MagiParams } from "@/lib/magi/engine";
import { sha256 } from "@/lib/magi/sha256";

const encoder = new TextEncoder();
const PLAYFAIR_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
const PLAYFAIR_KEY_LENGTH = 24;
const TEXT_MARKER = "MAGI2.";
const MIN_MASTER_KEY_LENGTH = 16;
const MAX_MASTER_KEY_LENGTH = 128;

export function deriveParamsFromMasterKey(masterKey: string): MagiParams {
  validateMasterKey(masterKey);

  const playfairSeed = deriveBytes(masterKey, "playfair-key", PLAYFAIR_KEY_LENGTH);
  const railSeed = deriveBytes(masterKey, "rail-depth", 1);
  const desKeySeed = deriveBytes(masterKey, "des-key", 8);
  const ivSeed = deriveBytes(masterKey, "des-iv", 8);

  return {
    playfairKey: mapToAlphabet(playfairSeed, PLAYFAIR_ALPHABET),
    railFenceDepth: (railSeed[0] % 7) + 2,
    desKeyHex: bytesToHex(desKeySeed),
    ivHex: bytesToHex(ivSeed),
  };
}

export function validateMasterKey(masterKey: string) {
  const normalized = masterKey.trim();

  if (normalized.length === 0) {
    throw new Error("Master key wajib diisi.");
  }

  if (normalized.length < MIN_MASTER_KEY_LENGTH) {
    throw new Error(`Master key minimal ${MIN_MASTER_KEY_LENGTH} karakter.`);
  }

  if (normalized.length > MAX_MASTER_KEY_LENGTH) {
    throw new Error(`Master key maksimal ${MAX_MASTER_KEY_LENGTH} karakter.`);
  }
}

export function encodeVersionedCiphertext(cipherBytes: Uint8Array) {
  return `${TEXT_MARKER}${bytesToHex(cipherBytes)}`;
}

export function decodeVersionedCiphertext(value: string) {
  const normalized = value.trim();
  if (!normalized.startsWith(TEXT_MARKER)) {
    throw new Error("Ciphertext harus memakai marker MAGI2.");
  }

  const hex = normalized.slice(TEXT_MARKER.length);
  if (!/^[0-9A-Fa-f]+$/.test(hex) || hex.length === 0 || hex.length % 2 !== 0) {
    throw new Error("Ciphertext MAGI2 tidak valid.");
  }

  return hexToBytes(hex);
}

function deriveBytes(masterKey: string, label: string, length: number) {
  const labelBytes = encoder.encode(label);
  const masterKeyBytes = encoder.encode(masterKey);
  const output = new Uint8Array(length);
  let offset = 0;
  let counter = 0;

  while (offset < length) {
    const block = new Uint8Array(masterKeyBytes.length + 1 + labelBytes.length + 4);
    block.set(masterKeyBytes, 0);
    block[masterKeyBytes.length] = 0;
    block.set(labelBytes, masterKeyBytes.length + 1);

    const view = new DataView(block.buffer);
    view.setUint32(block.length - 4, counter);

    const digest = sha256(block);
    const size = Math.min(digest.length, length - offset);
    output.set(digest.slice(0, size), offset);
    offset += size;
    counter += 1;
  }

  return output;
}

function mapToAlphabet(bytes: Uint8Array, alphabet: string) {
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function hexToBytes(value: string) {
  const output = new Uint8Array(value.length / 2);

  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }

  return output;
}
