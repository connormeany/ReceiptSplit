"use client";

import { useState, useRef, useCallback } from "react";

type InputMode = "link" | "upload";

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>("upload");
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [venmo, setVenmo] = useState("");
  const [groupSize, setGroupSize] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
      window.location.href = `/s/${data.sessionId}`;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900">Split Split</h1>
          <p className="mt-2 text-gray-500">
            Split your restaurant bills without the hassle
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Your Name
              </label>
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Your Venmo Username
              </label>
              <input
                type="text"
                placeholder="@yourname"
                value={venmo}
                onChange={(e) => setVenmo(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Group Size <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="number"
                min="2"
                max="20"
                placeholder="How many people?"
                value={groupSize}
                onChange={(e) => setGroupSize(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div className="mt-2 rounded-xl bg-gray-100 p-4">
              <p className="mb-3 text-sm font-semibold text-gray-800">
                Add your receipt
              </p>

              <div className="space-y-3">
                <div>
                  <input
                    type="url"
                    placeholder="Paste a receipt link (e.g. clover.com/p/...)"
                    value={imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value);
                      if (e.target.value.trim()) {
                        setInputMode("link");
                        setFile(null);
                      }
                    }}
                    className={`w-full rounded-lg border px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 ${
                      inputMode === "link" && imageUrl.trim()
                        ? "border-blue-400 bg-white"
                        : "border-gray-300 bg-white"
                    }`}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-gray-300" />
                  <span className="text-xs font-medium text-gray-400">OR</span>
                  <div className="h-px flex-1 bg-gray-300" />
                </div>

                {file ? (
                  <div className="flex items-center justify-between rounded-lg border-2 border-blue-400 bg-blue-50 px-4 py-4">
                    <p className="text-sm text-blue-700 truncate">{file.name}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                        if (cameraInputRef.current) cameraInputRef.current.value = "";
                      }}
                      className="ml-2 text-sm text-gray-400 hover:text-gray-600"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-1 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white px-3 py-5 transition hover:border-gray-400"
                    >
                      <p className="text-sm text-gray-500">Upload file</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex flex-1 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white px-3 py-5 transition hover:border-gray-400"
                    >
                      <p className="text-sm text-gray-500">Take photo</p>
                    </button>
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

            <button
              type="submit"
              disabled={loading || !ready}
              className="w-full rounded-lg bg-blue-500 py-3 font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Parsing receipt...
                </span>
              ) : (
                "Create Split"
              )}
            </button>
          </form>

          {error && (
            <p className="mt-3 text-sm text-red-500">{error}</p>
          )}
        </div>

        <div className="mt-8 space-y-3 text-center text-sm text-gray-400">
          <p>1. Enter your info and receipt</p>
          <p>2. Claim your items, then share the link</p>
          <p>3. Friends claim theirs and pay you via Venmo</p>
        </div>
      </div>
    </div>
  );
}
