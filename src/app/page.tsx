"use client";

import { useState } from "react";

export default function Home() {
  const [imageUrl, setImageUrl] = useState("");
  const [name, setName] = useState("");
  const [venmo, setVenmo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl.trim() || !name.trim() || !venmo.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: imageUrl.trim(),
          hostName: name.trim(),
          hostVenmo: venmo.trim().replace("@", ""),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      // Store person ID so we're auto-logged-in on the session page
      localStorage.setItem(`person-${data.sessionId}`, data.personId);
      window.location.href = `/s/${data.sessionId}`;
    } catch {
      setError("Failed to create session. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const ready = imageUrl.trim() && name.trim() && venmo.trim();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900">ReceiptSplit</h1>
          <p className="mt-2 text-gray-500">
            Split restaurant bills fairly with friends
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
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
                Receipt Link or Image URL
              </label>
              <input
                type="url"
                placeholder="https://www.clover.com/p/..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !ready}
              className="w-full rounded-lg bg-blue-500 py-3 font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? "Parsing receipt..." : "Create Split"}
            </button>
          </form>

          {error && (
            <p className="mt-3 text-sm text-red-500">{error}</p>
          )}
        </div>

        <div className="mt-8 space-y-3 text-center text-sm text-gray-400">
          <p>1. Enter your info and receipt link</p>
          <p>2. Claim your items, then share the link</p>
          <p>3. Friends claim theirs and pay you via Venmo</p>
        </div>
      </div>
    </div>
  );
}
