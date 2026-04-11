import { NextResponse } from "next/server";

import { encryptPayload, utf8ToBytes, type MagiParams } from "@/lib/magi/engine";
import { decodeImageBase64, encodePngDataUrl, packEncryptedImage } from "@/lib/magi/image-codec";
import { deriveParamsFromMasterKey, encodeVersionedCiphertext, validateMasterKey } from "@/lib/magi/master-key";

export const runtime = "nodejs";
const MAX_TEXT_BYTES = 32 * 1024;
const MAX_IMAGE_BASE64_LENGTH = 4 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const params = parseParams(body);

    if (body.inputType === "text") {
      if (typeof body.text !== "string" || body.text.length === 0) {
        throw new Error("Teks input wajib diisi.");
      }

      const plainBytes = utf8ToBytes(body.text);
      if (plainBytes.length > MAX_TEXT_BYTES) {
        throw new Error("Teks terlalu panjang. Maksimal 32 KB.");
      }

      const encrypted = encryptPayload(plainBytes, params);

      return noStoreJson({
        outputType: "text",
        result: encodeVersionedCiphertext(encrypted),
        encoding: "magi2-hex",
        metadata: {
          inputType: "text",
          version: "MAGI2",
          bytes: encrypted.length,
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
      const encrypted = encryptPayload(decoded.rgba, params);
      const packed = packEncryptedImage(encrypted, decoded.width, decoded.height);
      const encoded = encodePngDataUrl(packed);

      return noStoreJson({
        outputType: "image",
        mimeType: encoded.mimeType,
        dataUrl: encoded.dataUrl,
        metadata: {
          inputType: "image",
          version: "MGI2",
          originalWidth: decoded.width,
          originalHeight: decoded.height,
          packedWidth: packed.width,
          packedHeight: packed.height,
        },
      });
    }

    throw new Error("inputType harus text atau image.");
  } catch (error) {
    return noStoreJson(
      {
        error: error instanceof Error ? error.message : "Encrypt request gagal diproses.",
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
  return deriveParamsFromMasterKey(masterKey);
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
