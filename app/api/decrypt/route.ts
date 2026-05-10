import { NextResponse } from "next/server";

import {
  bytesToUtf8,
  decryptPayload,
  type BlockMode,
  type MagiParams,
} from "@/lib/magi/engine";
import { decodeImageBase64, encodePngDataUrl, unpackEncryptedImage } from "@/lib/magi/image-codec";
import { decodeVersionedCiphertext, deriveParamsFromMasterKey, validateMasterKey } from "@/lib/magi/master-key";

export const runtime = "nodejs";
const MAX_TEXT_BYTES = 128 * 1024;
const MAX_IMAGE_BASE64_LENGTH = 4 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const params = parseParams(body);

    if (body.inputType === "text") {
      if (typeof body.text !== "string" || body.text.trim().length === 0) {
        throw new Error("Ciphertext wajib diisi.");
      }

      if (body.text.length > MAX_TEXT_BYTES) {
        throw new Error("Ciphertext terlalu panjang.");
      }

      const decrypted = decryptPayload(decodeVersionedCiphertext(body.text, params.blockMode), params);

      return noStoreJson({
        outputType: "text",
        result: bytesToUtf8(decrypted),
        encoding: "utf8",
        metadata: {
          inputType: "text",
          blockMode: params.blockMode.toUpperCase(),
          version: params.blockMode === "ecb" ? "MAGI2E" : "MAGI2",
          bytes: decrypted.length,
        },
      });
    }

    if (body.inputType === "image") {
      if (!body.image?.data || !body.image?.mimeType) {
        throw new Error("Payload gambar tidak lengkap.");
      }

      if (typeof body.image.data !== "string" || body.image.data.length > MAX_IMAGE_BASE64_LENGTH) {
        throw new Error("Payload gambar terlalu besar.");
      }

      const decoded = decodeImageBase64(body.image.data, body.image.mimeType);
      const packed = unpackEncryptedImage(decoded);
      if (packed.blockMode !== params.blockMode) {
        throw new Error(
          packed.blockMode === "ecb"
            ? "File gambar ini memakai header MGE2. Pilih mode ECB untuk decrypt."
            : "File gambar ini memakai header MGI2. Pilih mode CBC untuk decrypt.",
        );
      }
      const decrypted = decryptPayload(packed.cipherBytes, params);
      const encoded = encodePngDataUrl({
        width: packed.width,
        height: packed.height,
        rgba: decrypted,
      });

      return noStoreJson({
        outputType: "image",
        mimeType: encoded.mimeType,
        dataUrl: encoded.dataUrl,
        metadata: {
          inputType: "image",
          blockMode: params.blockMode.toUpperCase(),
          version: params.blockMode === "ecb" ? "MGE2" : "MGI2",
          width: packed.width,
          height: packed.height,
        },
      });
    }

    throw new Error("inputType harus text atau image.");
  } catch (error) {
    return noStoreJson(
      {
        error: error instanceof Error ? error.message : "Decrypt request gagal diproses.",
      },
      { status: 400 },
    );
  }
}

function parseParams(body: unknown): MagiParams {
  if (!body || typeof body !== "object") {
    throw new Error("Body request tidak valid.");
  }

  const candidate = body as Record<string, unknown>;
  const masterKey = String(candidate.masterKey ?? "");
  validateMasterKey(masterKey);
  const blockMode = parseBlockMode(candidate.blockMode);
  return {
    ...deriveParamsFromMasterKey(masterKey),
    blockMode,
  };
}

function parseBlockMode(value: unknown): BlockMode {
  if (value === "ecb" || value === "cbc") {
    return value;
  }

  return "cbc";
}

function noStoreJson(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers ?? {}),
    },
  });
}
