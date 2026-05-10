import jpeg from "jpeg-js";
import { PNG } from "pngjs";

import type { BlockMode } from "@/lib/magi/engine";

export type DecodedImage = {
  width: number;
  height: number;
  rgba: Uint8Array;
};

const MAGIC_BY_MODE: Record<BlockMode, Uint8Array> = {
  cbc: new Uint8Array([0x4d, 0x47, 0x49, 0x32]),
  ecb: new Uint8Array([0x4d, 0x47, 0x45, 0x32]),
};
const HEADER_BYTES = 12;
const MAX_SOURCE_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 512;
const MAX_IMAGE_HEIGHT = 512;
const MAX_IMAGE_PIXELS = MAX_IMAGE_WIDTH * MAX_IMAGE_HEIGHT;

export function decodeImageBase64(base64: string, mimeType: string): DecodedImage {
  const buffer = Buffer.from(base64, "base64");

  if (buffer.length === 0) {
    throw new Error("Payload gambar kosong.");
  }

  if (buffer.length > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("Ukuran file gambar melebihi batas aman 2 MB.");
  }

  if (mimeType === "image/png") {
    const image = PNG.sync.read(buffer);
    return validateDecodedImage({
      width: image.width,
      height: image.height,
      rgba: new Uint8Array(image.data),
    });
  }

  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    const image = jpeg.decode(buffer, { useTArray: true });
    return validateDecodedImage({
      width: image.width,
      height: image.height,
      rgba: image.data,
    });
  }

  throw new Error("Format gambar belum didukung. Gunakan PNG atau JPG.");
}

export function encodePngDataUrl(image: DecodedImage) {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.rgba);
  const buffer = PNG.sync.write(png);
  return {
    mimeType: "image/png",
    base64: buffer.toString("base64"),
    dataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
  };
}

export function packEncryptedImage(cipherBytes: Uint8Array, width: number, height: number, blockMode: BlockMode) {
  const payload = new Uint8Array(HEADER_BYTES + cipherBytes.length);
  payload.set(MAGIC_BY_MODE[blockMode], 0);
  const view = new DataView(payload.buffer);
  view.setUint16(4, width);
  view.setUint16(6, height);
  view.setUint32(8, cipherBytes.length);
  payload.set(cipherBytes, HEADER_BYTES);

  const pixels = Math.ceil(payload.length / 4);
  const packedWidth = Math.ceil(Math.sqrt(pixels));
  const packedHeight = Math.ceil(pixels / packedWidth);
  const rgba = new Uint8Array(packedWidth * packedHeight * 4);
  rgba.set(payload);

  return {
    width: packedWidth,
    height: packedHeight,
    rgba,
  };
}

export function unpackEncryptedImage(image: DecodedImage) {
  const bytes = image.rgba;
  const blockMode = detectBlockMode(bytes);
  if (!blockMode) {
    throw new Error("File decrypt harus PNG hasil encrypt MAGI. Header MGI2/MGE2 tidak ditemukan.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const originalWidth = view.getUint16(4);
  const originalHeight = view.getUint16(6);
  const cipherLength = view.getUint32(8);
  const end = HEADER_BYTES + cipherLength;

  if (end > bytes.length) {
    throw new Error("Payload gambar terenkripsi rusak.");
  }

  return {
    width: originalWidth,
    height: originalHeight,
    blockMode,
    cipherBytes: bytes.slice(HEADER_BYTES, end),
  };
}

function detectBlockMode(bytes: Uint8Array): BlockMode | null {
  for (const [blockMode, magic] of Object.entries(MAGIC_BY_MODE) as [BlockMode, Uint8Array][]) {
    if (magic.every((value, index) => bytes[index] === value)) {
      return blockMode;
    }
  }

  return null;
}

function validateDecodedImage(image: DecodedImage) {
  if (image.width <= 0 || image.height <= 0) {
    throw new Error("Dimensi gambar tidak valid.");
  }

  if (image.width > MAX_IMAGE_WIDTH || image.height > MAX_IMAGE_HEIGHT) {
    throw new Error(`Dimensi gambar terlalu besar. Maksimal ${MAX_IMAGE_WIDTH}x${MAX_IMAGE_HEIGHT}px.`);
  }

  if (image.width * image.height > MAX_IMAGE_PIXELS) {
    throw new Error("Jumlah piksel gambar melebihi batas aman.");
  }

  return image;
}
