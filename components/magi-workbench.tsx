"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  ArrowDown,
  ArrowRightLeft,
  Binary,
  CheckCircle2,
  ImageIcon,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

type OperationMode = "encrypt" | "decrypt";
type InputMode = "text" | "image";

type PreparedImage = {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  originalSize: number;
  optimizedSize: number;
};

type ExecutionResult = {
  outputType: "text" | "image";
  endpoint: string;
  title: string;
  summary: string;
  output: string;
  metadata: Record<string, string | number>;
  imageDataUrl?: string;
  imageMimeType?: string;
};

type FormErrors = Partial<
  Record<"playfairKey" | "railFenceDepth" | "desKey" | "iv" | "textInput" | "image", string>
>;

const modeLabels: Record<OperationMode, { title: string; subtitle: string }> = {
  encrypt: {
    title: "Encryption Sequence",
    subtitle: "Playfair -> Rail Fence -> DES-CBC",
  },
  decrypt: {
    title: "Decryption Sequence",
    subtitle: "DES-CBC -> Rail Fence -> Playfair",
  },
};

const quickStats = [
  { label: "Pipeline", value: "3 Layer", icon: ShieldCheck },
  { label: "Image Limit", value: "128 x 128", icon: ImageIcon },
  { label: "DES Mode", value: "CBC 64-bit", icon: Binary },
];

const pipelineStages = [
  { title: "Melchior", subtitle: "Substitution matrix activated" },
  { title: "Balthasar", subtitle: "Zigzag transposition in progress" },
  { title: "Casper", subtitle: "DES-CBC block engine engaged" },
];

export function MagiWorkbench() {
  const [mode, setMode] = useState<OperationMode>("encrypt");
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [playfairKey, setPlayfairKey] = useState("");
  const [railFenceDepth, setRailFenceDepth] = useState("3");
  const [desKey, setDesKey] = useState("");
  const [iv, setIv] = useState("");
  const [textInput, setTextInput] = useState("");
  const [preparedImage, setPreparedImage] = useState<PreparedImage | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [pipelineIndex, setPipelineIndex] = useState(-1);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [preparedAt, setPreparedAt] = useState<string>("Belum ada payload");
  const [serverStatus, setServerStatus] = useState<"checking" | "online" | "offline">("checking");
  const [serverLatency, setServerLatency] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const formErrors = useMemo(
    () =>
      getFormErrors({
        playfairKey,
        railFenceDepth,
        desKey,
        iv,
        inputMode,
        textInput,
        preparedImage,
      }),
    [desKey, inputMode, iv, playfairKey, preparedImage, railFenceDepth, textInput],
  );

  const visibleErrors = submitAttempted ? formErrors : {};

  useEffect(() => {
    let cancelled = false;

    const checkServer = async () => {
      const startedAt = performance.now();

      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Health check failed");
        }

        if (!cancelled) {
          setServerStatus("online");
          setServerLatency(Math.max(1, Math.round(performance.now() - startedAt)));
        }
      } catch {
        if (!cancelled) {
          setServerStatus("offline");
          setServerLatency(null);
        }
      }
    };

    void checkServer();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setPreparedImage((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
    setPreparedAt("Belum ada payload");
    setResult(null);
    setSubmitAttempted(false);
  }, [mode]);

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await prepareImage(file);
  }

  function handleGenerateRandomKeys() {
    const keys = generateRandomKeys();

    setPlayfairKey(keys.playfairKey);
    setRailFenceDepth(keys.railFenceDepth);
    setDesKey(keys.desKey);
    setIv(keys.iv);
    setSubmitAttempted(false);
    toast.success("Random keyset siap dipakai.");
  }

  async function prepareImage(file: File) {
    const imageMimeType = getSupportedImageMimeType(file);

    if (!imageMimeType) {
      toast.error("File harus berupa gambar PNG atau JPG.");
      return;
    }

    if (mode === "decrypt" && imageMimeType !== "image/png") {
      toast.error("Mode decrypt membutuhkan PNG hasil encrypt MAGI.");
      return;
    }

    setIsProcessingImage(true);
    try {
      const processed = mode === "encrypt" ? await downscaleImage(file) : await prepareImageForDecryption(file);
      setPreparedImage((current) => {
        if (current) {
          URL.revokeObjectURL(current.previewUrl);
        }
        return processed;
      });
      setPreparedAt(new Date().toLocaleTimeString("id-ID"));
      setInputMode("image");
      toast.success(
        mode === "encrypt"
          ? "Gambar siap diproses dan sudah dioptimalkan di browser."
          : "Gambar terenkripsi siap dikirim tanpa resize ulang.",
      );
    } catch {
      toast.error("Gagal mempersiapkan gambar. Coba file lain.");
    } finally {
      setIsProcessingImage(false);
    }
  }

  async function handleExecute() {
    setSubmitAttempted(true);

    if (Object.keys(formErrors).length > 0) {
      toast.error("Masih ada field yang perlu dilengkapi.");
      return;
    }

    setIsExecuting(true);
    setPipelineIndex(0);

    try {
      const requestPromise = executeMagiRequest({
        mode,
        inputMode,
        playfairKey,
        railFenceDepth,
        desKey,
        iv,
        textInput,
        preparedImage,
      });

      for (let index = 0; index < pipelineStages.length; index += 1) {
        setPipelineIndex(index);
        await delay(index === pipelineStages.length - 1 ? 800 : 650);
      }

      const nextResult = await requestPromise;
      setResult(nextResult);
      toast.success(mode === "encrypt" ? "Payload berhasil dienkripsi." : "Payload berhasil didekripsi.");
      if (serverStatus !== "online") {
        setServerStatus("online");
      }
    } finally {
      setPipelineIndex(-1);
      setIsExecuting(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void prepareImage(file);
    }
  }

  return (
    <main className="relative overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col gap-6">
        <section className="relative overflow-hidden rounded-[28px] border border-white/12 bg-black/70 p-6 shadow-[0_0_80px_rgba(255,255,255,0.04)] backdrop-blur xl:p-8">
          <div className="absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_60%)]" />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/4 px-3 py-1 text-[10px] uppercase tracking-[0.35em] text-zinc-300">
                <Sparkles className="h-3 w-3 text-zinc-200" />
                Blackbox Interface
              </div>
              <h1 className="font-[family-name:var(--font-display)] text-[clamp(1.8rem,5vw,4rem)] leading-[1.35] text-white">
                <span className="typing-title scanline-text">MAGI CRYPT</span>
              </h1>
              <p className="mt-5 max-w-2xl text-sm uppercase tracking-[0.28em] text-zinc-500 sm:text-base">
                monochrome command surface
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.32em] text-zinc-600">
                boot sequence // archive-01 ready
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {quickStats.map(({ icon: Icon, label, value }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur"
                >
                  <Icon className="mb-4 h-5 w-5 text-zinc-200" />
                  <div className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                    {label}
                  </div>
                  <div className="mt-2 font-[family-name:var(--font-display)] text-lg text-white">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(300px,34%)_minmax(0,66%)]">
          <aside className="rounded-[30px] border border-white/10 bg-black/78 p-6 shadow-[0_0_45px_rgba(255,255,255,0.04)] backdrop-blur">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">
                  Command Center
                </p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">
                  Configuration
                </h2>
                <p className="mt-3 text-sm text-zinc-400">Keys and mode.</p>
              </div>
              <button
                type="button"
                onClick={handleGenerateRandomKeys}
                className="terminal-input inline-flex items-center justify-center rounded-2xl border border-white/12 bg-white/[0.04] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-zinc-200 transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-none"
                aria-label="Generate random valid keys"
              >
                Generate Random Keys
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <FieldLabel title="Operation Mode" subtitle="Encrypt or decrypt." />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(["encrypt", "decrypt"] as OperationMode[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMode(value)}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left transition",
                        mode === value
                          ? "border-white/30 bg-white/10 text-white shadow-[0_0_24px_rgba(255,255,255,0.07)]"
                          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.06]",
                      )}
                    >
                      <div className="font-[family-name:var(--font-display)] text-sm uppercase tracking-[0.18em]">
                        {value}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {modeLabels[value].subtitle}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <Field
                label="Playfair Key"
                hint="Playfair layer."
                value={playfairKey}
                onChange={setPlayfairKey}
                placeholder="contoh: MAGI-ALPHA"
                error={visibleErrors.playfairKey}
              />

              <Field
                label="Rail Fence Depth"
                hint="Minimum 2."
                value={railFenceDepth}
                onChange={setRailFenceDepth}
                placeholder="3"
                type="number"
                error={visibleErrors.railFenceDepth}
              />

              <Field
                label="DES Key"
                hint="64-bit hex."
                value={desKey}
                onChange={setDesKey}
                placeholder="16 hex characters"
                error={visibleErrors.desKey}
              />

              <Field
                label="Initialization Vector"
                hint="CBC IV."
                value={iv}
                onChange={setIv}
                placeholder="16 hex characters"
                error={visibleErrors.iv}
              />

              <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full animate-pulse",
                    serverStatus === "online" ? "bg-white" : "bg-zinc-600",
                  )}
                />
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-300">
                  {serverStatus === "checking"
                    ? "Server Status: Checking"
                    : serverStatus === "online"
                      ? `Server Status: Online - Latency ${serverLatency ?? "--"}ms`
                      : "Server Status: Offline"}
                </p>
              </div>
            </div>
          </aside>

          <section className="grid gap-6">
            <div className="rounded-[30px] border border-white/10 bg-black/78 p-6 shadow-[0_0_45px_rgba(255,255,255,0.04)] backdrop-blur">
              <div className="flex flex-col gap-4 border-b border-white/8 pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">
                    Workspace
                  </p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">
                    {modeLabels[mode].title}
                  </h2>
                </div>

                <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
                  {(["text", "image"] as InputMode[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setInputMode(value)}
                      className={cn(
                        "rounded-full px-4 py-2 text-sm transition",
                        inputMode === value
                          ? "bg-white/12 text-white"
                          : "text-zinc-500 hover:text-white",
                      )}
                    >
                      {value === "text" ? "Text payload" : "Image payload"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 space-y-5">
                {inputMode === "text" ? (
                  <div className="space-y-3">
                    <FieldLabel
                      title="Plaintext / Ciphertext"
                      subtitle="Message payload."
                    />
                    <textarea
                      value={textInput}
                      onChange={(event) => setTextInput(event.target.value)}
                      placeholder="Masukkan pesan, NIM, atau data uji yang akan diproses oleh pipeline MAGI."
                      className={cn(
                        "terminal-input min-h-[320px] w-full rounded-[28px] border bg-zinc-950/95 px-5 py-5 text-sm leading-7 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-white/40",
                        visibleErrors.textInput ? "border-zinc-300/80" : "border-white/10",
                      )}
                    />
                    <InlineMessage
                      error={visibleErrors.textInput}
                      hint="Teks akan dikirim sebagai payload string ke backend."
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <FieldLabel
                      title="Image Dropzone"
                      subtitle={mode === "encrypt" ? "PNG or JPG asset." : "MAGI encrypted PNG."}
                    />
                    <button
                      type="button"
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "group relative flex min-h-[340px] w-full flex-col items-center justify-center rounded-[32px] border border-dashed px-6 py-10 text-center transition",
                        visibleErrors.image
                          ? "border-zinc-300/80 bg-white/[0.04]"
                          : dragging
                            ? "border-white/40 bg-white/[0.08]"
                            : "border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(12,12,12,0.92))] hover:border-white/30 hover:bg-white/[0.05]",
                      )}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg"
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                      {isProcessingImage ? (
                        <>
                          <LoaderCircle className="h-10 w-10 animate-spin text-zinc-100" />
                          <p className="mt-4 text-sm text-zinc-300">
                            Menyiapkan citra dan menghitung ukuran optimal...
                          </p>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="h-12 w-12 text-zinc-100 transition group-hover:scale-110" />
                          <p className="mt-4 font-[family-name:var(--font-display)] text-xl text-white">
                            {mode === "encrypt" ? "Drop image asset here" : "Drop MAGI PNG here"}
                          </p>
                          <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-500">
                            {mode === "encrypt"
                              ? "Initialize encryption sequence."
                              : "Use the PNG downloaded from encrypt output."}
                          </p>
                        </>
                      )}
                    </button>
                    <InlineMessage
                      error={visibleErrors.image}
                      hint={
                        mode === "encrypt"
                          ? "Auto-resized to 128x128 max."
                          : "Decrypt mode sends the file unchanged."
                      }
                    />

                    {preparedImage ? (
                      <div className="grid gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={preparedImage.previewUrl}
                          alt="Prepared preview"
                          className="h-52 w-full rounded-2xl border border-white/10 object-cover"
                        />
                        <div className="space-y-3">
                          <div>
                              <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                              Prepared Payload
                            </p>
                            <h3 className="mt-2 font-[family-name:var(--font-display)] text-xl text-white">
                              {preparedImage.file.name}
                            </h3>
                          </div>
                          <InfoRow
                            label="Original"
                            value={`${preparedImage.originalWidth} x ${preparedImage.originalHeight}px`}
                          />
                          <InfoRow
                            label="Optimized"
                            value={`${preparedImage.width} x ${preparedImage.height}px`}
                          />
                          <InfoRow
                            label="Compression"
                            value={`${formatBytes(preparedImage.originalSize)} -> ${formatBytes(preparedImage.optimizedSize)}`}
                          />
                          <InfoRow label="Prepared at" value={preparedAt} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-3 py-1 text-center">
              <button
                type="button"
                onClick={() => void handleExecute()}
                disabled={isExecuting || isProcessingImage}
                className="inline-flex min-w-[260px] items-center justify-center gap-3 rounded-2xl border border-white/20 bg-white/[0.05] px-8 py-5 font-[family-name:var(--font-display)] text-sm uppercase tracking-[0.24em] text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExecuting ? (
                  <>
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                    Processing
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="h-5 w-5" />
                    Execute Sequence
                  </>
                )}
              </button>
              <ArrowDown className="h-5 w-5 text-zinc-400" />
            </div>

            <div className="rounded-[30px] border border-white/10 bg-black/78 p-6 shadow-[0_0_45px_rgba(255,255,255,0.04)] backdrop-blur">
              <div className="flex flex-col gap-3 border-b border-white/8 pb-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">
                    Output Deck
                  </p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">
                    Response Preview
                  </h2>
                </div>
                <p className="max-w-xl text-sm text-zinc-500">Output stream.</p>
              </div>

              {result ? (
                <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="rounded-[24px] border border-white/10 bg-zinc-950/95 p-4">
                    <div className="mb-4 flex items-center gap-3">
                      <ShieldCheck className="h-5 w-5 text-zinc-100" />
                      <div>
                        <p className="font-[family-name:var(--font-display)] text-lg text-white">
                          {result.title}
                        </p>
                        <p className="text-sm text-zinc-500">{result.summary}</p>
                      </div>
                    </div>
                    {result.outputType === "image" && result.imageDataUrl ? (
                      <div className="space-y-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={result.imageDataUrl}
                          alt="Output preview"
                          className="h-auto w-full rounded-[20px] border border-white/8 bg-[#050505] object-contain"
                        />
                        <div className="rounded-[20px] border border-white/8 bg-[#050505] p-4 text-sm leading-7 text-zinc-100">
                          {result.output}
                        </div>
                        <a
                          href={result.imageDataUrl}
                          download={
                            result.outputType === "image" && result.endpoint.includes("encrypt")
                              ? "magi-encrypted.png"
                              : "magi-restored.png"
                          }
                          className="inline-flex rounded-xl border border-white/12 px-4 py-2 text-xs uppercase tracking-[0.2em] text-zinc-200 transition hover:bg-white/10"
                        >
                          Download PNG
                        </a>
                      </div>
                    ) : (
                      <pre className="overflow-x-auto rounded-[20px] border border-white/8 bg-[#050505] p-4 text-sm leading-7 text-zinc-100">
                        <code>{result.output}</code>
                      </pre>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                        Endpoint
                      </p>
                      <p className="mt-2 font-mono text-sm text-white">{result.endpoint}</p>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                        Metadata
                      </p>
                      <div className="mt-3 space-y-3">
                        {Object.entries(result.metadata).map(([key, value]) => (
                          <InfoRow key={key} label={key} value={String(value)} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/3 px-6 py-12 text-center">
                  <ShieldCheck className="mx-auto h-10 w-10 text-zinc-100" />
                  <p className="mt-4 font-[family-name:var(--font-display)] text-lg text-white">
                    Belum ada hasil eksekusi
                  </p>
                  <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-zinc-500">
                    Ready for the next sequence.
                  </p>
                </div>
              )}
            </div>
          </section>
        </section>
      </div>

      {isExecuting ? (
        <PipelineOverlay
          mode={mode}
          pipelineIndex={pipelineIndex}
          progress={((pipelineIndex + 1) / pipelineStages.length) * 100}
        />
      ) : null}
    </main>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  error,
  type = "text",
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: string;
  type?: "text" | "number";
}) {
  return (
    <label className="block">
      <FieldLabel title={label} subtitle={hint} />
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          "terminal-input mt-3 w-full rounded-2xl border bg-zinc-950/95 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-white/60 focus:ring-2 focus:ring-white/20",
          error ? "border-zinc-300/80" : "border-white/10",
        )}
      />
      <InlineMessage error={error} />
    </label>
  );
}

function FieldLabel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-400">{subtitle}</p>
    </div>
  );
}

function InlineMessage({ error, hint }: { error?: string; hint?: string }) {
  return (
    <p className={cn("mt-2 text-xs leading-5", error ? "text-zinc-200" : "text-zinc-600")}>
      {error ?? hint ?? " "}
    </p>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/6 bg-zinc-950/75 px-3 py-2 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right text-white">{value}</span>
    </div>
  );
}

function PipelineOverlay({
  mode,
  pipelineIndex,
  progress,
}: {
  mode: OperationMode;
  pipelineIndex: number;
  progress: number;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/78 px-4 backdrop-blur-md">
      <div className="w-full max-w-3xl rounded-[32px] border border-white/12 bg-black/92 p-6 shadow-[0_0_90px_rgba(255,255,255,0.06)] sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">
              Pipeline Status
            </p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">
              {mode === "encrypt" ? "MAGI Encryption Active" : "MAGI Decryption Active"}
            </h3>
          </div>
          <LoaderCircle className="h-8 w-8 animate-spin text-zinc-100" />
        </div>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#f5f5f5,#a3a3a3,#ffffff)] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {pipelineStages.map((stage, index) => {
            const state =
              index < pipelineIndex ? "done" : index === pipelineIndex ? "active" : "idle";

            return (
              <div
                key={stage.title}
                className={cn(
                  "rounded-[24px] border p-4 transition",
                  state === "active" &&
                    "border-white/30 bg-white/[0.08] shadow-[0_0_24px_rgba(255,255,255,0.07)]",
                  state === "done" && "border-white/20 bg-white/[0.05]",
                  state === "idle" && "border-white/10 bg-white/5",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-[family-name:var(--font-display)] text-lg text-white">
                    {stage.title}
                  </p>
                  {state === "done" ? (
                    <CheckCircle2 className="h-5 w-5 text-zinc-100" />
                  ) : state === "active" ? (
                    <LoaderCircle className="h-5 w-5 animate-spin text-zinc-100" />
                  ) : (
                    <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  )}
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-500">{stage.subtitle}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function getFormErrors({
  playfairKey,
  railFenceDepth,
  desKey,
  iv,
  inputMode,
  textInput,
  preparedImage,
}: {
  playfairKey: string;
  railFenceDepth: string;
  desKey: string;
  iv: string;
  inputMode: InputMode;
  textInput: string;
  preparedImage: PreparedImage | null;
}) {
  const errors: FormErrors = {};

  if (!playfairKey.trim()) {
    errors.playfairKey = "Playfair key wajib diisi.";
  }

  if (Number(railFenceDepth) < 2) {
    errors.railFenceDepth = "Rail Fence depth minimal 2.";
  }

  if (!isHex64(desKey)) {
    errors.desKey = "DES key harus terdiri dari 16 karakter hex.";
  }

  if (!isHex64(iv)) {
    errors.iv = "IV CBC harus terdiri dari 16 karakter hex.";
  }

  if (inputMode === "text" && !textInput.trim()) {
    errors.textInput = "Teks input belum diisi.";
  }

  if (inputMode === "image" && !preparedImage) {
    errors.image = "Silakan unggah gambar terlebih dahulu.";
  }

  return errors;
}

function isHex64(value: string) {
  return /^[0-9a-fA-F]{16}$/.test(value.trim());
}

function generateRandomKeys() {
  const playfairSeeds = [
    "MELCHIOR",
    "BALTHASAR",
    "CASPER",
    "TERMINAL",
    "BLACKBOX",
    "ARCHIVE",
    "NERV",
    "ORACLE",
  ];
  const seed = playfairSeeds[randomInt(playfairSeeds.length)];

  return {
    playfairKey: `${seed}-${randomHex(3)}`,
    railFenceDepth: String(randomInt(7) + 2),
    desKey: randomHex(8),
    iv: randomHex(8),
  };
}

function randomHex(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function randomInt(maxExclusive: number) {
  const bytes = new Uint32Array(1);
  window.crypto.getRandomValues(bytes);
  return bytes[0] % maxExclusive;
}

async function executeMagiRequest({
  mode,
  inputMode,
  playfairKey,
  railFenceDepth,
  desKey,
  iv,
  textInput,
  preparedImage,
}: {
  mode: OperationMode;
  inputMode: InputMode;
  playfairKey: string;
  railFenceDepth: string;
  desKey: string;
  iv: string;
  textInput: string;
  preparedImage: PreparedImage | null;
}): Promise<ExecutionResult> {
  const endpoint = `/api/${mode}`;
  const payload = await buildMagiPayload({
    inputMode,
    playfairKey,
    railFenceDepth,
    desKey,
    iv,
    textInput,
    preparedImage,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as
    | {
        error?: string;
        outputType?: "text" | "image";
        result?: string;
        dataUrl?: string;
        metadata?: Record<string, string | number>;
      }
    | undefined;

  if (!response.ok || !data?.outputType) {
    throw new Error(data?.error ?? "Request MAGI gagal diproses.");
  }

  if (data.outputType === "image") {
    return {
      outputType: "image",
      endpoint,
      title: mode === "encrypt" ? "Encrypted PNG Container" : "Restored Image Output",
      summary:
        mode === "encrypt"
          ? "RGBA payload telah dibungkus menjadi PNG noise yang tetap valid."
          : "PNG terenkripsi berhasil dipulihkan ke dimensi gambar aslinya.",
      output:
        mode === "encrypt"
          ? "Image payload packed into a valid PNG container."
          : "Image payload restored from the encrypted PNG container.",
      metadata: data.metadata ?? {},
      imageDataUrl: data.dataUrl,
      imageMimeType: "image/png",
    };
  }

  return {
    outputType: "text",
    endpoint,
    title: mode === "encrypt" ? "Ciphertext Output" : "Plaintext Output",
    summary:
      mode === "encrypt"
        ? "Teks berhasil melewati tiga layer kriptografi dan dikembalikan sebagai hex."
        : "Ciphertext berhasil dibuka dan dipulihkan menjadi plaintext asli.",
    output: data.result ?? "",
    metadata: data.metadata ?? {},
  };
}

async function buildMagiPayload({
  inputMode,
  playfairKey,
  railFenceDepth,
  desKey,
  iv,
  textInput,
  preparedImage,
}: {
  inputMode: InputMode;
  playfairKey: string;
  railFenceDepth: string;
  desKey: string;
  iv: string;
  textInput: string;
  preparedImage: PreparedImage | null;
}) {
  if (inputMode === "text") {
    return {
      inputType: "text",
      playfairKey,
      railFenceDepth: Number(railFenceDepth),
      desKey,
      iv,
      text: textInput,
    };
  }

  if (!preparedImage) {
    throw new Error("Silakan unggah gambar terlebih dahulu.");
  }

  const imageMimeType = getSupportedImageMimeType(preparedImage.file);
  if (!imageMimeType) {
    throw new Error("File gambar harus PNG atau JPG.");
  }

  return {
    inputType: "image",
    playfairKey,
    railFenceDepth: Number(railFenceDepth),
    desKey,
    iv,
    image: {
      data: await fileToBase64(preparedImage.file),
      mimeType: imageMimeType,
      fileName: preparedImage.file.name,
    },
  };
}

async function downscaleImage(file: File): Promise<PreparedImage> {
  const originalUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(originalUrl);
    const { width, height } = constrainDimensions(image.naturalWidth, image.naturalHeight, 128);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas context unavailable");
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    const mimeType = getSupportedImageMimeType(file) === "image/png" ? "image/png" : "image/jpeg";
    const blob = await canvasToBlob(canvas, mimeType, 0.92);
    const optimizedFile = new File([blob], file.name, { type: mimeType });
    const previewUrl = URL.createObjectURL(blob);

    return {
      file: optimizedFile,
      previewUrl,
      width,
      height,
      originalWidth: image.naturalWidth,
      originalHeight: image.naturalHeight,
      originalSize: file.size,
      optimizedSize: optimizedFile.size,
    };
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}

async function prepareImageForDecryption(file: File): Promise<PreparedImage> {
  const previewUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(previewUrl);
    return {
      file,
      previewUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
      originalWidth: image.naturalWidth,
      originalHeight: image.naturalHeight,
      originalSize: file.size,
      optimizedSize: file.size,
    };
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw error;
  }
}

function constrainDimensions(width: number, height: number, maxSize: number) {
  if (width <= maxSize && height <= maxSize) {
    return { width, height };
  }

  const ratio = Math.min(maxSize / width, maxSize / height);

  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Blob creation failed"));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

function getSupportedImageMimeType(file: File) {
  const fileType = file.type.toLowerCase();
  if (fileType === "image/png" || fileType === "image/jpeg" || fileType === "image/jpg") {
    return fileType === "image/jpg" ? "image/jpeg" : fileType;
  }

  const fileName = file.name.toLowerCase();
  if (fileName.endsWith(".png")) {
    return "image/png";
  }
  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  return "";
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Gagal membaca file image."));
        return;
      }

      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Gagal membaca file image."));
    reader.readAsDataURL(file);
  });
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
