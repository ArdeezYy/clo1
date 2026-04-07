import { NextResponse } from "next/server";

import {
  bytesToUtf8,
  decodeCipherInput,
  decryptPayload,
  type MagiParams,
  validateParams,
} from "@/lib/magi/engine";
import { decodeImageBase64, encodePngDataUrl, unpackEncryptedImage } from "@/lib/magi/image-codec";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const params = parseParams(body);

    if (body.inputType === "text") {
      if (typeof body.text !== "string" || body.text.trim().length === 0) {
        throw new Error("Ciphertext wajib diisi.");
      }

      const decrypted = decryptPayload(decodeCipherInput(body.text), params);

      return NextResponse.json({
        outputType: "text",
        result: bytesToUtf8(decrypted),
        encoding: "utf8",
        metadata: {
          inputType: "text",
          bytes: decrypted.length,
        },
      });
    }

    if (body.inputType === "image") {
      if (!body.image?.data || !body.image?.mimeType) {
        throw new Error("Payload gambar tidak lengkap.");
      }

      const decoded = decodeImageBase64(body.image.data, body.image.mimeType);
      const packed = unpackEncryptedImage(decoded);
      const decrypted = decryptPayload(packed.cipherBytes, params);
      const encoded = encodePngDataUrl({
        width: packed.width,
        height: packed.height,
        rgba: decrypted,
      });

      return NextResponse.json({
        outputType: "image",
        mimeType: encoded.mimeType,
        dataUrl: encoded.dataUrl,
        metadata: {
          inputType: "image",
          width: packed.width,
          height: packed.height,
        },
      });
    }

    throw new Error("inputType harus text atau image.");
  } catch (error) {
    return NextResponse.json(
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
  const params = {
    playfairKey: String(candidate.playfairKey ?? ""),
    railFenceDepth: Number(candidate.railFenceDepth ?? 0),
    desKeyHex: String(candidate.desKey ?? ""),
    ivHex: String(candidate.iv ?? ""),
  };

  validateParams(params);
  return params;
}
