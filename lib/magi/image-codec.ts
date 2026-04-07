import jpeg from "jpeg-js";
import { PNG } from "pngjs";

export type DecodedImage = {
  width: number;
  height: number;
  rgba: Uint8Array;
};

const MAGIC = new Uint8Array([0x4d, 0x47, 0x49, 0x31]);
const HEADER_BYTES = 12;

export function decodeImageBase64(base64: string, mimeType: string): DecodedImage {
  const buffer = Buffer.from(base64, "base64");

  if (mimeType === "image/png") {
    const image = PNG.sync.read(buffer);
    return {
      width: image.width,
      height: image.height,
      rgba: new Uint8Array(image.data),
    };
  }

  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    const image = jpeg.decode(buffer, { useTArray: true });
    return {
      width: image.width,
      height: image.height,
      rgba: image.data,
    };
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

export function packEncryptedImage(cipherBytes: Uint8Array, width: number, height: number) {
  const payload = new Uint8Array(HEADER_BYTES + cipherBytes.length);
  payload.set(MAGIC, 0);
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
  if (!matchesMagic(bytes)) {
    throw new Error("File decrypt harus PNG hasil encrypt MAGI. Header MGI1 tidak ditemukan.");
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
    cipherBytes: bytes.slice(HEADER_BYTES, end),
  };
}

function matchesMagic(bytes: Uint8Array) {
  return MAGIC.every((value, index) => bytes[index] === value);
}
