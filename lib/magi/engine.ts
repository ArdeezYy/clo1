import {
  desDecryptCbc,
  desDecryptEcb,
  desEncryptCbc,
  desEncryptEcb,
} from "@/lib/magi/des";

export type BlockMode = "cbc" | "ecb";

export type MagiParams = {
  playfairKey: string;
  railFenceDepth: number;
  desKeyHex: string;
  ivHex: string;
  blockMode: BlockMode;
};

const HEADER_SIZE = 4;
const BYTE_DOMAIN = 256;
const PLAYFAIR_SIDE = 16;

export function encryptPayload(input: Uint8Array, params: MagiParams) {
  validateParams(params);
  const prepared = addLengthHeader(input);
  const playfairReady = ensureEvenLength(prepared);
  const playfair = playfairTransform(playfairReady, params.playfairKey, "encrypt");
  const railFence = railFenceEncrypt(playfair, params.railFenceDepth);
  const keyBytes = hexToBytes(params.desKeyHex);
  const ivBytes = hexToBytes(params.ivHex);
  return params.blockMode === "ecb"
    ? desEncryptEcb(railFence, keyBytes)
    : desEncryptCbc(railFence, keyBytes, ivBytes);
}

export function decryptPayload(input: Uint8Array, params: MagiParams) {
  validateParams(params);
  const keyBytes = hexToBytes(params.desKeyHex);
  const ivBytes = hexToBytes(params.ivHex);
  const des =
    params.blockMode === "ecb"
      ? desDecryptEcb(input, keyBytes)
      : desDecryptCbc(input, keyBytes, ivBytes);
  const railFence = railFenceDecrypt(des, params.railFenceDepth);
  const playfair = playfairTransform(railFence, params.playfairKey, "decrypt");
  return stripLengthHeader(playfair);
}

export function utf8ToBytes(value: string) {
  return new TextEncoder().encode(value);
}

export function bytesToUtf8(value: Uint8Array) {
  return new TextDecoder().decode(value);
}

export function bytesToHex(value: Uint8Array) {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function decodeCipherInput(value: string) {
  const normalized = value.trim();

  if (/^[0-9a-fA-F]+$/.test(normalized) && normalized.length % 2 === 0) {
    return parseHexBytes(normalized);
  }

  return new Uint8Array(Buffer.from(normalized, "base64"));
}

export function hexToBytes(value: string) {
  const normalized = value.trim();
  if (!/^[0-9a-fA-F]{16}$/.test(normalized)) {
    throw new Error("Key DES dan IV harus berupa 16 karakter hex.");
  }

  return parseHexBytes(normalized);
}

function parseHexBytes(value: string) {
  const normalized = value.trim();
  const size = normalized.length / 2;
  const bytes = new Uint8Array(size);

  for (let index = 0; index < size; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

export function validateParams(params: MagiParams) {
  if (!params.playfairKey.trim()) {
    throw new Error("Playfair key wajib diisi.");
  }

  if (!Number.isInteger(params.railFenceDepth) || params.railFenceDepth < 2) {
    throw new Error("Rail Fence depth minimal 2.");
  }

  if (params.blockMode !== "cbc" && params.blockMode !== "ecb") {
    throw new Error("Mode blok harus ECB atau CBC.");
  }

  hexToBytes(params.desKeyHex);
  hexToBytes(params.ivHex);
}

function addLengthHeader(input: Uint8Array) {
  const output = new Uint8Array(HEADER_SIZE + input.length);
  const view = new DataView(output.buffer);
  view.setUint32(0, input.length);
  output.set(input, HEADER_SIZE);
  return output;
}

function stripLengthHeader(input: Uint8Array) {
  if (input.length < HEADER_SIZE) {
    throw new Error("Payload dekripsi tidak valid.");
  }

  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const length = view.getUint32(0);
  const available = input.length - HEADER_SIZE;

  if (length > available) {
    throw new Error("Header panjang payload tidak valid.");
  }

  return input.slice(HEADER_SIZE, HEADER_SIZE + length);
}

function ensureEvenLength(input: Uint8Array) {
  if (input.length % 2 === 0) {
    return input;
  }

  const output = new Uint8Array(input.length + 1);
  output.set(input);
  return output;
}

function playfairTransform(input: Uint8Array, key: string, mode: "encrypt" | "decrypt") {
  const { table, positions } = buildPlayfairTable(key);
  const output = new Uint8Array(input.length);
  const shift = mode === "encrypt" ? 1 : -1;

  for (let index = 0; index < input.length; index += 2) {
    const first = input[index];
    const second = input[index + 1];
    const [rowA, colA] = positions[first];
    const [rowB, colB] = positions[second];

    let nextRowA = rowA;
    let nextColA = colA;
    let nextRowB = rowB;
    let nextColB = colB;

    if (rowA === rowB) {
      nextColA = wrap(colA + shift, PLAYFAIR_SIDE);
      nextColB = wrap(colB + shift, PLAYFAIR_SIDE);
    } else if (colA === colB) {
      nextRowA = wrap(rowA + shift, PLAYFAIR_SIDE);
      nextRowB = wrap(rowB + shift, PLAYFAIR_SIDE);
    } else {
      nextColA = colB;
      nextColB = colA;
    }

    output[index] = table[nextRowA * PLAYFAIR_SIDE + nextColA];
    output[index + 1] = table[nextRowB * PLAYFAIR_SIDE + nextColB];
  }

  return output;
}

function buildPlayfairTable(key: string) {
  const seed = utf8ToBytes(key);
  const table: number[] = [];
  const seen = new Set<number>();

  for (const byte of seed) {
    if (!seen.has(byte)) {
      seen.add(byte);
      table.push(byte);
    }
  }

  for (let value = 0; value < BYTE_DOMAIN; value += 1) {
    if (!seen.has(value)) {
      seen.add(value);
      table.push(value);
    }
  }

  const positions = Array.from({ length: BYTE_DOMAIN }, () => [0, 0] as [number, number]);
  table.forEach((value, index) => {
    positions[value] = [Math.floor(index / PLAYFAIR_SIDE), index % PLAYFAIR_SIDE];
  });

  return {
    table,
    positions,
  };
}

function railFenceEncrypt(input: Uint8Array, depth: number) {
  if (depth <= 1 || input.length <= 2) {
    return input.slice();
  }

  const rails = Array.from({ length: depth }, () => [] as number[]);
  let row = 0;
  let direction = 1;

  for (const byte of input) {
    rails[row].push(byte);
    if (row === 0) {
      direction = 1;
    } else if (row === depth - 1) {
      direction = -1;
    }
    row += direction;
  }

  return Uint8Array.from(rails.flat());
}

function railFenceDecrypt(input: Uint8Array, depth: number) {
  if (depth <= 1 || input.length <= 2) {
    return input.slice();
  }

  const path: number[] = [];
  let row = 0;
  let direction = 1;

  for (let index = 0; index < input.length; index += 1) {
    path.push(row);
    if (row === 0) {
      direction = 1;
    } else if (row === depth - 1) {
      direction = -1;
    }
    row += direction;
  }

  const counts = Array.from({ length: depth }, () => 0);
  path.forEach((value) => {
    counts[value] += 1;
  });

  const rails = Array.from({ length: depth }, () => [] as number[]);
  let cursor = 0;
  counts.forEach((count, rail) => {
    rails[rail] = Array.from(input.slice(cursor, cursor + count));
    cursor += count;
  });

  const indices = Array.from({ length: depth }, () => 0);
  const output = new Uint8Array(input.length);
  path.forEach((rail, index) => {
    output[index] = rails[rail][indices[rail]];
    indices[rail] += 1;
  });

  return output;
}

function wrap(value: number, size: number) {
  return ((value % size) + size) % size;
}
