"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  File,
  FileImage,
  FileText,
  FolderOpen,
  Globe2,
  HardDrive,
  Layers3,
  Link2,
  Loader2,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  WifiOff,
  X,
  HelpCircle,
  ArrowRight,
  Send,
  RefreshCw,
} from "lucide-react";
import {
  supabase,
  configured,
  MAX_FILE,
  LIMIT,
  formatBytes,
} from "@/lib/supabase";
import { guestKey } from "@/lib/guest";
type Item = {
  id: string;
  name: string;
  size: number;
  created_at: string;
  expires_at: string;
  share_token: string;
  status: string;
};
const samples: Item[] = [
  {
    id: "demo-1",
    name: "Brand guidelines.pdf",
    size: 2400000,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 172800000).toISOString(),
    share_token: "",
    status: "demo",
  },
  {
    id: "demo-2",
    name: "Summer collection.zip",
    size: 18600000,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    share_token: "",
    status: "demo",
  },
  {
    id: "demo-3",
    name: "Moodboard.png",
    size: 4200000,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 172800000).toISOString(),
    share_token: "",
    status: "demo",
  },
];
export default function Home() {
  const [items, setItems] = useState<Item[]>(configured ? [] : samples),
    [tab, setTab] = useState("overview"),
    [query, setQuery] = useState(""),
    [guestInfo, setGuestInfo] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [drag, setDrag] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(false),
    [share, setShare] = useState<Item | null>(null),
    [download, setDownload] = useState<Item | null>(null),
    [usage, setUsage] = useState(0),
    [khmer, setKhmer] = useState(true),
    [loading, setLoading] = useState(configured),
    [uploadName, setUploadName] = useState(""),
    [copied, setCopied] = useState(false),
    [pendingDelete, setPendingDelete] = useState<Item | null>(null),
    [deleting, setDeleting] = useState(false),
    [downloading, setDownloading] = useState<string | null>(null),
    [shareState, setShareState] = useState<"loading" | "missing" | null>(null);
  const input = useRef<HTMLInputElement>(null),
    xhr = useRef<XMLHttpRequest | null>(null);
  const t = (km: string, en: string) => (khmer ? km : en);
  function notify(message: string, failed = false) {
    setNotice(message);
    setError(failed);
  }
  async function refresh() {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("file-manager", {
        body: { action: "list", guest_key: guestKey() },
      });
      if (error || data?.error) throw Error(data?.error || error?.message);
      setItems(data.files || []);
      setUsage(Number(data.usage) || 0);
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Could not load your files.",
        true,
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (!supabase) return;
    refresh();
    const token = location.pathname.startsWith("/s/")
      ? location.pathname.split("/")[2]
      : new URLSearchParams(location.search).get("share");
    if (token) {
      setShareState("loading");
      supabase.rpc("resolve_share", { token }).then(({ data, error }) => {
        if (error || !data?.length) setShareState("missing");
        else {
          setShareState(null);
          setDownload(data[0]);
        }
      });
    }
    return () => {
      xhr.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function upload(file?: globalThis.File) {
    if (!file) return;
    if (file.size === 0 || file.size > MAX_FILE) {
      notify(
        t(
          "សូមជ្រើសរើសឯកសារពី 1 byte ដល់ 20 MB។",
          "Choose a file between 1 byte and 20 MB.",
        ),
        true,
      );
      return;
    }
    if (!supabase) {
      notify(
        "Connect Supabase to upload files. This is a design preview.",
        true,
      );
      return;
    }
    setBusy(true);
    setUploadName(file.name);
    setProgress(0);
    let reservation: string | undefined;
    try {
      const { data, error } = await supabase.functions.invoke("file-manager", {
        body: {
          action: "reserve",
          guest_key: guestKey(),
          name: file.name,
          size: file.size,
          type: file.type,
        },
      });
      if (error || data.error) throw Error(data?.error || error?.message);
      reservation = data.id;
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        xhr.current = request;
        request.open("PUT", data.upload_url);
        request.setRequestHeader(
          "Content-Type",
          file.type || "application/octet-stream",
        );
        request.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setProgress(Math.round((e.loaded / e.total) * 100));
        };
        request.onload = () =>
          request.status >= 200 && request.status < 300
            ? resolve()
            : reject(Error("Upload failed. Please retry."));
        request.onerror = () =>
          reject(Error("Network interrupted. Please retry."));
        request.onabort = () => reject(Error("Upload cancelled."));
        request.send(file);
      });
      const result = await supabase.functions.invoke("file-manager", {
        body: { action: "complete", guest_key: guestKey(), id: reservation },
      });
      if (result.error || result.data.error)
        throw Error(result.data?.error || result.error?.message);
      setShare(result.data.file);
      await refresh();
      notify(t("ឯកសាររួចរាល់សម្រាប់ចែករំលែក។", "Your file is ready to share."));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Upload failed.", true);
      if (reservation)
        await supabase.functions.invoke("file-manager", {
          body: { action: "delete", guest_key: guestKey(), id: reservation },
        });
    } finally {
      setBusy(false);
      xhr.current = null;
      if (input.current) input.current.value = "";
    }
  }
  async function remove(item: Item) {
    if (item.status === "demo") {
      notify("Preview file — connect Supabase to manage your files.");
      return;
    }
    setDeleting(true);
    const { data, error } = await supabase!.functions.invoke("file-manager", {
      body: { action: "delete", guest_key: guestKey(), id: item.id },
    });
    if (error || data?.error) notify(data?.error || error?.message, true);
    else {
      notify(
        "Sharing disabled. Recent uploads are permanently removed after their upload URL expires.",
      );
      refresh();
    }
    setDeleting(false);
    setPendingDelete(null);
  }
  async function copy(item: Item) {
    if (!item.share_token) {
      notify("Preview file — upload a file to create a real sharing link.");
      return;
    }
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/s/${item.share_token}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      notify(t("បានចម្លងតំណភ្ជាប់។", "Sharing link copied."));
    } catch {
      setShare(item);
    }
  }
  async function getDownload(item: Item) {
    if (downloading) return;
    if (!supabase || !item.share_token) {
      notify(
        t(
          "ឯកសារឧទាហរណ៍ មិនអាចទាញយកបានទេ។",
          "Sample files cannot be downloaded. Upload a file first.",
        ),
        true,
      );
      return;
    }
    setDownloading(item.id);
    try {
      const { data, error } = await supabase.functions.invoke("file-manager", {
        body: { action: "download", token: item.share_token },
      });
      if (error || data?.error || !data?.url)
        throw new Error(
          data?.error || error?.message || "This file is no longer available.",
        );
      // Download bytes rather than navigating away to a storage URL. This also
      // lets us report expired links and failed transfers inside the app.
      const response = await fetch(data.url, { cache: "no-store" });
      if (!response.ok)
        throw new Error(
          t(
            "ទាញយកមិនបានទេ។ សូមសាកល្បងម្តងទៀត។",
            "Download failed. Please try again.",
          ),
        );
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = item.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Give mobile browsers time to consume the object URL.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      notify(
        t(
          "បានចាប់ផ្ដើមទាញយក។ សូមពិនិត្យថតទាញយករបស់អ្នក។",
          "Download started. Check your downloads.",
        ),
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : t("ទាញយកមិនបានទេ។", "Could not download the file."),
        true,
      );
    } finally {
      setDownloading(null);
    }
  }
  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(query.toLowerCase()),
  );
  const goUpload = () => {
    setTab("overview");
    requestAnimationFrame(() =>
      document
        .getElementById("upload")
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  };
  const closeModal = () => {
    setGuestInfo(false);
    setShare(null);
    setDownload(null);
    setPendingDelete(null);
    setShareState(null);
    setCopied(false);
  };
  const activeModal =
    guestInfo || share || download || pendingDelete || shareState;
  useEffect(() => {
    if (!activeModal) return;
    const previous = document.activeElement as HTMLElement | null;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
      if (event.key === "Tab") {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[role="dialog"] button:not([disabled]), [role="dialog"] input, [role="dialog"] a',
          ),
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const timer = setTimeout(
      () =>
        document.querySelector<HTMLElement>('[role="dialog"] button')?.focus(),
      0,
    );
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handler);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [Boolean(activeModal)]);
  const fileIcon = (name: string) =>
    name.endsWith(".pdf") ? (
      <FileText size={23} />
    ) : name.endsWith(".zip") ? (
      <File size={23} />
    ) : (
      <FileImage size={23} />
    );
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        {t("ទៅមាតិកា", "Skip to content")}
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="Pannheu home">
            <span className="brand-mark">
              <Layers3 size={25} />
            </span>
            <span>
              បញ្ញើ<small>PANNHEU</small>
            </span>
          </a>
          <nav className="desktop-nav" aria-label="Main navigation">
            <button
              className={tab === "overview" ? "active" : ""}
              onClick={goUpload}
            >
              {t("ផ្ញើឯកសារ", "Send a file")}
            </button>
            <button
              className={tab === "files" ? "active" : ""}
              onClick={() => setTab("files")}
            >
              {t("ឯកសាររបស់ខ្ញុំ", "My files")}
              <span>{items.length}</span>
            </button>
          </nav>
          <div className="header-actions">
            <button
              className="language"
              onClick={() => setKhmer(!khmer)}
              aria-label="Switch language"
            >
              <Globe2 size={17} />
              {khmer ? "English" : "ខ្មែរ"}
            </button>
            <button
              className="help-button"
              onClick={() => setGuestInfo(true)}
              aria-label="How it works"
            >
              <HelpCircle size={21} />
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="main-content">
        {!configured && (
          <div className="preview-banner">
            <span className="status-dot" />
            {t(
              "រូបរាងសាកល្បង · ឯកសារខាងក្រោមជាឧទាហរណ៍",
              "Design preview · Files below are examples",
            )}
          </div>
        )}
        {tab === "overview" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span className="status-dot" />
                  {t(
                    "ឥតគិតថ្លៃ។ មិនចាំបាច់មានគណនី។",
                    "FREE TO SHARE. NO ACCOUNT NEEDED.",
                  )}
                </div>
                <h1>
                  {t("ផ្ញើឯកសារ", "Big ideas.")}
                  <br />
                  <span>{t("ងាយស្រួលជាងមុន។", "One simple link.")}</span>
                </h1>
                <p>
                  {t(
                    "ជ្រើសរើសឯកសារ ចម្លងតំណភ្ជាប់ ហើយផ្ញើទៅអ្នកណាក៏បាន។ រួចរាល់ក្នុងប៉ុន្មានវិនាទី។",
                    "Pick a file, grab a link, and send it to anyone. From your device to theirs, in seconds.",
                  )}
                </p>
                <div className="hero-pills">
                  <span>
                    <ShieldCheck size={16} />
                    {t("មិនចាំបាច់ចុះឈ្មោះ", "No sign-up")}
                  </span>
                  <span>
                    <Clock3 size={16} />
                    {t("រក្សាទុក ៣ ថ្ងៃ", "Stored for 3 days")}
                  </span>
                </div>
                <div className="hero-caption">
                  <span className="mini-icon">
                    <Send size={16} />
                  </span>
                  {t(
                    "ពីឧបករណ៍របស់អ្នក ទៅកាន់ពួកគេ។",
                    "A little less friction. A little more connection.",
                  )}
                </div>
              </div>
              <section
                id="upload"
                aria-label="Upload a file"
                className={`upload-card ${drag ? "dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  if (!busy) upload(e.dataTransfer.files[0]);
                }}
              >
                <div className="card-topline">
                  <span>
                    <span className="status-dot" />
                    {t("រួចរាល់សម្រាប់ផ្ញើ", "READY WHEN YOU ARE")}
                  </span>
                  <span className="step-count">01 — 03</span>
                </div>
                <div className="drop-area">
                  <div className="upload-illustration">
                    <div className="illustration-ring" />
                    <span className="floating-file back">
                      <FileImage size={27} />
                    </span>
                    <span className="floating-file front">
                      <ArrowUp size={33} />
                    </span>
                    <span className="illustration-spark">✳</span>
                  </div>
                  <h2>
                    {busy
                      ? t("កំពុងផ្ទុកឯកសារ…", "Sending your file…")
                      : t(
                          "ឯកសាររបស់អ្នក ចាប់ផ្ដើមនៅទីនេះ",
                          "Good things start here.",
                        )}
                  </h2>
                  <p className="drop-description">
                    {busy
                      ? uploadName
                      : t(
                          "អូសឯកសារមកទីនេះ ឬចុចប៊ូតុងខាងក្រោម",
                          "Drop a file here, or choose one below.",
                        )}
                  </p>
                  <input
                    ref={input}
                    type="file"
                    hidden
                    aria-label="Choose upload file"
                    onChange={(e) => upload(e.target.files?.[0])}
                  />
                  {busy ? (
                    <div className="progress-panel">
                      <div>
                        <span>
                          {progress === 100
                            ? t("កំពុងរៀបចំតំណភ្ជាប់…", "Creating your link…")
                            : t("កំពុងផ្ទុក…", "Uploading…")}
                        </span>
                        <strong>{progress}%</strong>
                      </div>
                      <progress
                        aria-label="Upload progress"
                        max="100"
                        value={progress}
                      />
                      <button
                        className="text-button"
                        disabled={!xhr.current}
                        onClick={() => xhr.current?.abort()}
                      >
                        {t("បោះបង់", "Cancel upload")}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="primary choose-button"
                      onClick={() => input.current?.click()}
                    >
                      <Plus size={21} />
                      {t("ជ្រើសរើសឯកសារ", "Choose a file")}
                      <ArrowUpRight size={19} />
                    </button>
                  )}
                  <span className="upload-limit">
                    {t(
                      "ឯកសារគ្រប់ប្រភេទ · អតិបរមា 20 MB",
                      "Any file type · Up to 20 MB",
                    )}
                  </span>
                </div>
                <div className="upload-card-bottom">
                  <LockKeyhole size={14} />
                  {t(
                    "មានតែអ្នកដែលមានតំណភ្ជាប់ ទើបអាចទាញយកបាន",
                    "Only people with your link can download.",
                  )}
                </div>
              </section>
            </section>
            <section className="how-strip" aria-label="Three simple steps">
              {[
                {
                  n: "01",
                  Icon: Upload,
                  title: t("ជ្រើសរើស", "Pick it"),
                  text: t("បន្ថែមឯកសារ", "Choose your file"),
                },
                {
                  n: "02",
                  Icon: Link2,
                  title: t("ចម្លងតំណ", "Link it"),
                  text: t("ចម្លងតំណភ្ជាប់", "Copy your unique link"),
                },
                {
                  n: "03",
                  Icon: Send,
                  title: t("ចែករំលែក", "Share it"),
                  text: t("ផ្ញើទៅអ្នកណាក៏បាន", "Send it to anyone"),
                },
              ].map((step) => (
                <div className="how-step" key={step.n}>
                  <span className="step-icon">
                    <step.Icon size={20} />
                  </span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                  <span className="step-number">{step.n}</span>
                </div>
              ))}
            </section>
          </>
        )}
        <section className="files-section" aria-labelledby="files-title">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                {t("កន្លែងផ្ទាល់ខ្លួនរបស់អ្នក", "YOUR LITTLE CORNER")}
              </div>
              <h2 id="files-title">
                {t("ឯកសាររបស់ខ្ញុំ", "Your recent files")}{" "}
                <span className="count-badge">{items.length}</span>
              </h2>
              <p>
                {t(
                  "ឯកសារដែលបានផ្ញើពីកម្មវិធីរុករកនេះ។",
                  "Sent from this browser. Ready to share again.",
                )}
              </p>
            </div>
            <div className="file-tools">
              <button
                className="icon-button"
                aria-label="Refresh files"
                onClick={refresh}
                disabled={loading}
              >
                <RefreshCw size={18} className={loading ? "spin" : ""} />
              </button>
              <label className="search">
                <Search size={18} />
                <input
                  aria-label="Search files"
                  placeholder={t("ស្វែងរកឯកសារ…", "Search files…")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
          </div>
          <div className="file-list" aria-busy={loading}>
            {loading ? (
              <div className="empty-state">
                <Loader2 size={28} className="spin" />
                <p>{t("កំពុងទាញយកឯកសារ…", "Loading your files…")}</p>
              </div>
            ) : filtered.length ? (
              filtered.map((item) => (
                <article className="file-row" key={item.id}>
                  <div className="file-name">
                    <span
                      className={`file-icon ${item.name.endsWith(".pdf") ? "pdf" : item.name.endsWith(".zip") ? "zip" : "image"}`}
                    >
                      {fileIcon(item.name)}
                    </span>
                    <div>
                      <h3 title={item.name}>{item.name}</h3>
                      <p>
                        {formatBytes(item.size)}
                        <span>·</span>
                        {item.status === "demo"
                          ? t("ឯកសារឧទាហរណ៍", "Sample file")
                          : t("បានផ្ទុករួច", "Ready to share")}
                      </p>
                    </div>
                  </div>
                  <span className="expiry">
                    <Clock3 size={14} />
                    {Math.max(
                      0,
                      Math.ceil(
                        (new Date(item.expires_at).getTime() - Date.now()) /
                          86400000,
                      ),
                    )}{" "}
                    {t("ថ្ងៃទៀត", "days left")}
                  </span>
                  <div className="file-actions">
                    <button
                      className="icon-button download-button"
                      onClick={() => getDownload(item)}
                      disabled={Boolean(downloading)}
                      aria-label={`Download ${item.name}`}
                      title={t("ទាញយកឯកសារ", "Download file")}
                    >
                      {downloading === item.id ? (
                        <Loader2 size={18} className="spin" />
                      ) : (
                        <Download size={18} />
                      )}
                    </button>
                    <button
                      className="copy-button"
                      onClick={() => copy(item)}
                      aria-label={`Copy link for ${item.name}`}
                    >
                      <Link2 size={17} />
                      <span>{t("ចម្លងតំណ", "Copy link")}</span>
                    </button>
                    <button
                      className="icon-button delete-button"
                      onClick={() =>
                        item.status === "demo"
                          ? remove(item)
                          : setPendingDelete(item)
                      }
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <span className="empty-icon">
                  <FolderOpen size={30} />
                </span>
                <h3>
                  {query
                    ? t("រកមិនឃើញឯកសារ", "No matching files")
                    : t(
                        "ឯកសារដំបូងរបស់អ្នក ចាប់ផ្ដើមនៅទីនេះ",
                        "Your first share starts here.",
                      )}
                </h3>
                <p>
                  {query
                    ? t("សូមសាកល្បងពាក្យផ្សេង។", "Try a different filename.")
                    : t(
                        "ផ្ទុកឯកសារ ដើម្បីទទួលបានតំណភ្ជាប់។",
                        "Upload a file and we’ll make a link for you.",
                      )}
                </p>
                {!query && (
                  <button className="secondary" onClick={goUpload}>
                    {t("ផ្ញើឯកសារដំបូង", "Send your first file")}
                    <ArrowRight size={17} />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="files-note">
            <ShieldCheck size={15} />
            {t(
              "រក្សាកម្មវិធីរុករកនេះ ដើម្បីគ្រប់គ្រងឯកសាររបស់អ្នក។",
              "Your file list stays with this browser.",
            )}
            <button onClick={() => setGuestInfo(true)}>
              {t("ស្វែងយល់បន្ថែម", "Learn more")}
              <ArrowUpRight size={13} />
            </button>
          </div>
        </section>
        <section className="storage-banner">
          <span className="storage-icon">
            <HardDrive size={22} />
          </span>
          <div className="storage-copy">
            <h3>
              {t(
                "កន្លែងរួម សម្រាប់ចែករំលែក",
                "A shared space, thoughtfully kept.",
              )}
            </h3>
            <p>
              {t(
                "ឯកសារត្រូវបានលុបក្រោយ ៣ ថ្ងៃ ឬមុននេះ ពេលទំហំផ្ទុកពេញ។",
                "Files expire after 3 days, or earlier when storage is full.",
              )}
            </p>
          </div>
          <div className="storage-usage">
            <div>
              <span>{t("ទំហំផ្ទុករួម", "Community storage")}</span>
              <strong>
                {formatBytes(usage)} <small>/ 800 MB</small>
              </strong>
            </div>
            <div className="storage-track">
              <span
                style={{ width: `${Math.min(100, (usage / LIMIT) * 100)}%` }}
              />
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <a href="/" className="footer-wordmark">
          <Layers3 size={19} />
          pannheu<span>®</span>
        </a>
        <span>
          {t(
            "ឯកសារតូច ឬគំនិតធំ ចែករំលែកបានទាំងអស់។",
            "Small files. Big possibilities.",
          )}
        </span>
        <button onClick={() => setGuestInfo(true)}>
          {t("របៀបប្រើ", "How it works")}
          <ArrowUpRight size={14} />
        </button>
      </footer>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button
          className={tab === "overview" ? "selected" : ""}
          onClick={goUpload}
        >
          <Upload size={21} />
          {t("ផ្ញើឯកសារ", "Send a file")}
        </button>
        <button
          className={tab === "files" ? "selected" : ""}
          onClick={() => setTab("files")}
        >
          <FolderOpen size={21} />
          {t("ឯកសារខ្ញុំ", "My files")}
        </button>
        <button onClick={() => setGuestInfo(true)}>
          <HelpCircle size={21} />
          {t("របៀបប្រើ", "How it works")}
        </button>
      </nav>
      {notice && (
        <div
          role={error ? "alert" : "status"}
          className={`toast ${error ? "error" : ""}`}
        >
          {error ? <WifiOff size={19} /> : <CheckCircle2 size={19} />}
          <span>{notice}</span>
          <button aria-label="Dismiss" onClick={() => setNotice("")}>
            <X size={18} />
          </button>
        </div>
      )}
      {activeModal && (
        <div className="modal-backdrop" onClick={closeModal}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close icon-button"
              onClick={closeModal}
              aria-label="Close"
            >
              <X size={21} />
            </button>
            {guestInfo ? (
              <>
                <span className="modal-icon">
                  <ShieldCheck size={27} />
                </span>
                <div className="eyebrow">
                  {t("ងាយស្រួល តាំងពីដំបូង", "SIMPLE FROM THE START")}
                </div>
                <h2 id="modal-title">
                  {t("មិនចាំបាច់មានគណនី។", "No account. Just share.")}
                </h2>
                <p>
                  {t(
                    "ផ្ទុកឯកសារ ចម្លងតំណភ្ជាប់ ហើយផ្ញើទៅមិត្តភក្តិរបស់អ្នក។ ពួកគេអាចទាញយកបានភ្លាមៗ។",
                    "Upload a file, copy its link, and send it to a friend. They can download it right away.",
                  )}
                </p>
                <div className="modal-notice">
                  <LockKeyhole size={19} />
                  <p>
                    {t(
                      "ប្រើកម្មវិធីរុករកនេះ ដើម្បីមើល និងលុបឯកសាររបស់អ្នក។ ការសម្អាតទិន្នន័យកម្មវិធីរុករក នឹងបាត់បង់សិទ្ធិគ្រប់គ្រងឯកសារ។",
                      "Use this same browser to view and delete your uploads. Clearing browser data removes management access. Shared links keep working until files expire.",
                    )}
                  </p>
                </div>
                <p className="small-text">
                  {t(
                    "20 MB ក្នុងមួយឯកសារ · រក្សាទុក ៣ ថ្ងៃ · អាចត្រូវលុបមុនពេលកំណត់ ពេលទំហំផ្ទុកពេញ។",
                    "20 MB per file · Stored for 3 days · May be removed sooner when storage is full.",
                  )}
                </p>
                <button
                  className="primary full-width"
                  onClick={() => {
                    closeModal();
                    goUpload();
                  }}
                >
                  {t("ចាប់ផ្ដើមផ្ញើ", "Start sharing")}
                  <ArrowRight size={18} />
                </button>
              </>
            ) : pendingDelete ? (
              <>
                <span className="modal-icon danger">
                  <Trash2 size={25} />
                </span>
                <h2 id="modal-title">
                  {t("លុបឯកសារនេះ?", "Remove this file?")}
                </h2>
                <p className="filename-detail">{pendingDelete.name}</p>
                <p>
                  {t(
                    "តំណភ្ជាប់នឹងឈប់ដំណើរការ។ ឯកសារថ្មីៗនឹងត្រូវបានលុបជាអចិន្ត្រៃយ៍ ក្រោយតំណផ្ទុកផុតកំណត់។",
                    "The sharing link will stop working. Recent uploads are permanently removed after their upload URL expires.",
                  )}
                </p>
                <div className="modal-buttons">
                  <button
                    className="secondary"
                    onClick={closeModal}
                    disabled={deleting}
                  >
                    {t("រក្សាទុក", "Keep file")}
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => remove(pendingDelete)}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <Loader2 className="spin" size={17} />
                    ) : (
                      <Trash2 size={17} />
                    )}{" "}
                    {t("លុបឯកសារ", "Delete file")}
                  </button>
                </div>
              </>
            ) : shareState ? (
              <>
                <span className="modal-icon">
                  {shareState === "loading" ? (
                    <Loader2 className="spin" size={28} />
                  ) : (
                    <Clock3 size={28} />
                  )}
                </span>
                <h2 id="modal-title">
                  {shareState === "loading"
                    ? t("កំពុងបើកឯកសារ…", "Opening your file…")
                    : t(
                        "ឯកសារនេះលែងមានទៀតហើយ",
                        "This file is no longer available.",
                      )}
                </h2>
                <p>
                  {shareState === "loading"
                    ? t("សូមរង់ចាំបន្តិច។", "Just a moment.")
                    : t(
                        "តំណភ្ជាប់នេះបានផុតកំណត់ ឬឯកសារត្រូវបានលុប។ សុំតំណថ្មីពីអ្នកផ្ញើ។",
                        "This link has expired or the file was removed. Ask the sender for a fresh link.",
                      )}
                </p>
              </>
            ) : (
              <>
                <span className="modal-icon">
                  {share ? <Check size={29} /> : <Download size={29} />}
                </span>
                <div className="eyebrow">
                  {share
                    ? t("រួចរាល់ហើយ", "READY TO GO")
                    : t("បានចែករំលែកជាមួយអ្នក", "SHARED WITH YOU")}
                </div>
                <h2 id="modal-title">
                  {share
                    ? t(
                        "តំណមួយ ចែករំលែកបានគ្រប់ទីកន្លែង។",
                        "One link. All yours to share.",
                      )
                    : t("ឯកសារមួយ សម្រាប់អ្នក។", "A little something for you.")}
                </h2>
                <div className="shared-file">
                  <span className="file-icon pdf">
                    {fileIcon((share || download)!.name)}
                  </span>
                  <div>
                    <strong>{(share || download)!.name}</strong>
                    <span>{formatBytes((share || download)!.size)}</span>
                  </div>
                </div>
                {share ? (
                  <>
                    <label className="link-label" htmlFor="share-link">
                      {t("តំណភ្ជាប់របស់អ្នក", "Your sharing link")}
                    </label>
                    <input
                      id="share-link"
                      readOnly
                      onFocus={(e) => e.target.select()}
                      value={
                        typeof location !== "undefined"
                          ? `${location.origin}/s/${share.share_token}`
                          : ""
                      }
                    />
                    <button
                      className="primary full-width"
                      onClick={() => copy(share)}
                    >
                      {copied ? <Check size={18} /> : <Copy size={18} />}{" "}
                      {copied
                        ? t("បានចម្លង!", "Link copied!")
                        : t("ចម្លងតំណភ្ជាប់", "Copy sharing link")}
                    </button>
                    <button
                      className="secondary full-width"
                      disabled={Boolean(downloading)}
                      onClick={() => getDownload(share)}
                    >
                      {downloading === share.id ? (
                        <Loader2 className="spin" size={18} />
                      ) : (
                        <Download size={18} />
                      )}
                      {t("ទាញយកឯកសារ", "Download file")}
                    </button>
                  </>
                ) : (
                  <button
                    className="primary full-width"
                    disabled={Boolean(downloading)}
                    onClick={() => getDownload(download!)}
                  >
                    {downloading ? (
                      <Loader2 className="spin" size={18} />
                    ) : (
                      <Download size={18} />
                    )}{" "}
                    {t("ទាញយកឯកសារ", "Download file")}
                  </button>
                )}
                <p className="small-text">
                  <Clock3 size={14} /> {t("ផុតកំណត់", "Expires")}{" "}
                  {new Date((share || download)!.expires_at).toLocaleDateString(
                    khmer ? "km-KH" : "en-GB",
                  )}
                  .{" "}
                  {t(
                    "អាចត្រូវបានលុបមុន ពេលទំហំផ្ទុកពេញ។",
                    "May be removed sooner when storage is full.",
                  )}
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
