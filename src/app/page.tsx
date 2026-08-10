"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type InputMode = "link" | "upload";

const STORAGE_KEY_NAME = "splitsplit-name";
const STORAGE_KEY_VENMO = "splitsplit-venmo";

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>("upload");
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [venmo, setVenmo] = useState("");
  const [groupSize, setGroupSize] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Restore saved name & venmo for returning users
  useEffect(() => {
    try {
      const savedName = localStorage.getItem(STORAGE_KEY_NAME);
      const savedVenmo = localStorage.getItem(STORAGE_KEY_VENMO);
      if (savedName) setName(savedName);
      if (savedVenmo) setVenmo(savedVenmo);
    } catch {
      // localStorage unavailable (e.g. private browsing)
    }
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const ready =
    name.trim() &&
    venmo.trim() &&
    (inputMode === "link" ? imageUrl.trim() : file);

  // Compress image to stay under upload limits
  const compressImage = useCallback(async (file: File): Promise<File> => {
    // Skip non-image files (PDFs)
    if (!file.type.startsWith("image/")) return file;
    // Skip if already small enough (under 1MB)
    if (file.size <= 1024 * 1024) return file;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        // Scale down large images, max 2048px on longest side
        const maxDim = 2048;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          0.8
        );
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;

    setLoading(true);
    setError("");

    try {
      let receiptUrl = imageUrl.trim();

      // If uploading a file, upload it first
      if (inputMode === "upload" && file) {
        const compressed = await compressImage(file);
        const formData = new FormData();
        formData.append("file", compressed);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const uploadData = await uploadRes.json();

        if (!uploadRes.ok) {
          setError(uploadData.error || "Failed to upload image");
          setLoading(false);
          return;
        }

        receiptUrl = uploadData.url;
      }

      const res = await fetch("/api/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: receiptUrl,
          hostName: name.trim(),
          hostVenmo: venmo.trim().replace("@", ""),
          groupSize: groupSize ? parseInt(groupSize) : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      localStorage.setItem(`person-${data.sessionId}`, data.personId);

      // Save name & venmo for returning users
      try {
        localStorage.setItem(STORAGE_KEY_NAME, name.trim());
        localStorage.setItem(STORAGE_KEY_VENMO, venmo.trim());
      } catch {
        // localStorage unavailable
      }

      window.location.href = `/s/${data.sessionId}`;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 font-sans text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Split <span className="text-foreground/40">Split</span>
          </h1>
          <p className="mt-2 text-sm text-foreground/70">
            Create a new receipt session
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-8 shadow-sm">
          <form onSubmit={handleSubmit} noValidate className="space-y-6">

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Your Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Venmo Handle
                  </label>
                  <input
                    type="text"
                    placeholder="@username"
                    value={venmo}
                    onChange={(e) => setVenmo(e.target.value)}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                  />
                </div>
                <div className="w-24">
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Group Size
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="20"
                    placeholder="3"
                    value={groupSize}
                    onChange={(e) => setGroupSize(e.target.value)}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono text-foreground placeholder:text-foreground/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <label className="mb-3 block text-sm font-medium text-foreground">
                Receipt Image
              </label>

              <div className="space-y-4">
                {file ? (
                  <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2.5">
                    <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                        if (cameraInputRef.current) cameraInputRef.current.value = "";
                      }}
                      className="ml-3 text-xs font-medium text-foreground/60 hover:text-primary transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-md border-2 border-dashed border-border bg-background px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-surface"
                      >
                        <p className="text-sm font-medium text-foreground">Upload File</p>
                        <p className="mt-1 text-[10px] text-foreground/60">Image or PDF</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="rounded-md border-2 border-dashed border-border bg-background px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-surface"
                      >
                        <p className="text-sm font-medium text-foreground">Take Photo</p>
                        <p className="mt-1 text-[10px] text-foreground/60">Camera</p>
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs font-medium uppercase text-foreground/40 tracking-widest">OR</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>

                    <div>
                      <input
                        type="url"
                        placeholder="Paste receipt link here..."
                        value={imageUrl}
                        onChange={(e) => {
                          setImageUrl(e.target.value);
                          if (e.target.value.trim()) {
                            setInputMode("link");
                            setFile(null);
                          }
                        }}
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                      />
                    </div>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (selected) {
                      setFile(selected);
                      setInputMode("upload");
                      setImageUrl("");
                    }
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (selected) {
                      setFile(selected);
                      setInputMode("upload");
                      setImageUrl("");
                    }
                  }}
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || !ready}
                className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-surface shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {loading ? "Processing..." : "Create Split"}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-center text-sm font-medium text-red-800">{error}</p>
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-xs text-foreground/50">
          <p>Easily split the bill</p>
        </div>
      </div>
    </div>
  );
}
