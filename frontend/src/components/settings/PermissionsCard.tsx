"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ShieldCheck,
  Smartphone,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  RefreshCw,
  FolderOpen,
  Camera,
  MapPin,
  Mic,
  Users,
  Bell,
  Radio,
  Activity,
  Eye,
  Vibrate,
  BatteryCharging,
  FileText,
  Image as ImageIcon,
  Monitor,
  Clipboard,
  Info,
  Laptop,
  X,
  Copy,
  Check,
  Lock,
} from "lucide-react";
import {
  CAPABILITIES,
  PermissionCapability,
  PermissionPolicy,
  allPolicies,
  setPolicy,
  PERM_POLICY_EVENT,
} from "@/lib/consent";
import { CAP_META } from "@/components/permission/PermissionProvider";
import { cn } from "@/lib/utils";

// Detects platform and deep-links directly to native settings when supported, or guides the user safely
export async function openDeviceAppSettings(): Promise<{ opened: boolean; platform: "capacitor" | "ios" | "android" | "mac" | "windows" | "web" }> {
  if (typeof window === "undefined") return { opened: false, platform: "web" };

  // 1. Capacitor Native Shell (iOS / Android build)
  const C = (window as any).Capacitor;
  if (C?.Plugins?.App?.openSettings) {
    try {
      await C.Plugins.App.openSettings();
      return { opened: true, platform: "capacitor" };
    } catch {
      // Fall through to browser guide
    }
  }

  // 2. Web Browsers on iOS, Android, macOS, or Windows:
  // Direct URL schemes like 'app-settings:' or 'intent:' cause Safari / WebKit to throw:
  // "Safari cannot open the page because the address is invalid."
  // Instead, return platform info so the interactive Device Settings modal opens safely on both phone and laptop.
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return { opened: false, platform: "ios" };

  const isAndroid = /Android/.test(ua);
  if (isAndroid) return { opened: false, platform: "android" };

  const isMac = /Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.platform || ua);
  if (isMac) return { opened: false, platform: "mac" };

  const isWindows = /Win32|Win64|Windows|WinCE/.test(navigator.platform || ua);
  if (isWindows) return { opened: false, platform: "windows" };

  return { opened: false, platform: "web" };
}

// Categorized structure mirroring native phone device settings
interface PermissionCategory {
  id: string;
  title: string;
  description: string;
  icon: typeof ShieldCheck;
  capabilities: PermissionCapability[];
  devicePathHint: string;
}

const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: "vault",
    title: "Documents, Files & Media Vault",
    description: "Access and index offline documents, PDFs, photos, and local assets for JARVIS knowledge.",
    icon: FolderOpen,
    devicePathHint: "iOS: Settings → JARVIS OS → Photos & Files | Android: Settings → Apps → JARVIS OS → Permissions → Files and media",
    capabilities: ["files", "photos"],
  },
  {
    id: "vision",
    title: "Camera & Optical Vision",
    description: "Live camera capture, document OCR, visual scene analysis, and screen sharing.",
    icon: Camera,
    devicePathHint: "iOS: Settings → JARVIS OS → Camera | Android: Settings → Apps → JARVIS OS → Permissions → Camera",
    capabilities: ["camera", "screen"],
  },
  {
    id: "audio",
    title: "Microphone & Voice Intelligence",
    description: "Hands-free wake word detection, voice dictation, and ambient acoustic processing.",
    icon: Mic,
    devicePathHint: "iOS: Settings → JARVIS OS → Microphone | Android: Settings → Apps → JARVIS OS → Permissions → Microphone",
    capabilities: ["microphone"],
  },
  {
    id: "location",
    title: "Location & Spatial Navigation",
    description: "GPS geofencing, precise location, local weather, commute alerts, and ambient context.",
    icon: MapPin,
    devicePathHint: "iOS: Settings → JARVIS OS → Location | Android: Settings → Apps → JARVIS OS → Permissions → Location",
    capabilities: ["location"],
  },
  {
    id: "contacts",
    title: "Contacts & Direct Outreach",
    description: "Phonebook lookup for instant dialing, automated WhatsApp dispatch, and SMS messages.",
    icon: Users,
    devicePathHint: "iOS: Settings → JARVIS OS → Contacts | Android: Settings → Apps → JARVIS OS → Permissions → Contacts",
    capabilities: ["contacts"],
  },
  {
    id: "alerts",
    title: "Alerts, Briefings & Clipboard",
    description: "Push notifications for reminders, daily executive briefings, and clipboard integration.",
    icon: Bell,
    devicePathHint: "iOS: Settings → JARVIS OS → Notifications | Android: Settings → Apps → JARVIS OS → Notifications",
    capabilities: ["notifications", "clipboard"],
  },
  {
    id: "hardware",
    title: "Hardware & Physical Controls",
    description: "Bluetooth IoT hubs, shake-to-activate motion gestures, haptics, wake lock, and power.",
    icon: Radio,
    devicePathHint: "iOS: Settings → JARVIS OS → Bluetooth & Motion | Android: Settings → Apps → JARVIS OS → Permissions → Nearby devices",
    capabilities: ["bluetooth", "motion", "wakeLock", "vibration", "battery"],
  },
];

type SystemStatus = "granted" | "denied" | "prompt" | "unsupported" | "unknown";

export function PermissionsCard() {
  const [policies, setPolicies] = useState<Record<PermissionCapability, PermissionPolicy> | null>(null);
  const [systemStatuses, setSystemStatuses] = useState<Record<string, SystemStatus>>({});
  const [testResults, setTestResults] = useState<Record<string, { status: "testing" | "success" | "error"; message: string }>>({});
  const [showDesktopHelp, setShowDesktopHelp] = useState(false);
  const [promptingAll, setPromptingAll] = useState(false);
  const [promptStep, setPromptStep] = useState<string | null>(null);
  const [platformInfo, setPlatformInfo] = useState<{ isIOS: boolean; isAndroid: boolean; isMac: boolean; isWindows: boolean; isLaptop: boolean }>({
    isIOS: false,
    isAndroid: false,
    isMac: false,
    isWindows: false,
    isLaptop: false,
  });
  const fileTestInputRef = useRef<HTMLInputElement>(null);
  const photoTestInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);
    const isMac = !isIOS && /Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.platform || ua);
    const isWindows = /Win32|Win64|Windows|WinCE/.test(navigator.platform || ua);
    const isLaptop = isMac || isWindows || (!isIOS && !isAndroid);
    setPlatformInfo({ isIOS, isAndroid, isMac, isWindows, isLaptop });
  }, []);

  // Load policies
  useEffect(() => {
    setPolicies(allPolicies());
    const onChange = () => setPolicies(allPolicies());
    window.addEventListener(PERM_POLICY_EVENT, onChange);
    return () => window.removeEventListener(PERM_POLICY_EVENT, onChange);
  }, []);

  // Probe system permission states using navigator.permissions
  const refreshSystemStatuses = useCallback(async () => {
    if (typeof window === "undefined") return;

    const statuses: Record<string, SystemStatus> = {};

    // Notifications
    if (typeof Notification !== "undefined") {
      statuses.notifications = Notification.permission as SystemStatus;
    }

    // Modern permission queries
    if (navigator.permissions?.query) {
      const map: Partial<Record<PermissionCapability, string>> = {
        camera: "camera",
        microphone: "microphone",
        location: "geolocation",
        clipboard: "clipboard-read",
      };

      await Promise.all(
        Object.entries(map).map(async ([cap, permName]) => {
          try {
            const res = await navigator.permissions.query({ name: permName as PermissionName });
            statuses[cap] = res.state as SystemStatus;
          } catch {
            statuses[cap] = "unknown";
          }
        })
      );
    }

    setSystemStatuses((prev) => ({ ...prev, ...statuses }));
  }, []);

  useEffect(() => {
    refreshSystemStatuses();
  }, [refreshSystemStatuses]);

  // Handle open settings action - safe across Phone (iOS/Android) and Laptop (Mac/Windows)
  const handleOpenSettings = async () => {
    const res = await openDeviceAppSettings();
    if (!res.opened) {
      setShowDesktopHelp(true);
    }
  };

  // Prompt and verify all core hardware permissions in one tap
  const handlePromptAllPermissions = async () => {
    setPromptingAll(true);
    setPromptStep("Initializing hardware test...");

    // 1. Microphone
    setPromptStep("1/4: Requesting Microphone access...");
    try {
      if (typeof navigator.mediaDevices?.getUserMedia === "function") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch {}

    // 2. Camera
    setPromptStep("2/4: Requesting Camera access...");
    try {
      if (typeof navigator.mediaDevices?.getUserMedia === "function") {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280 } });
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch {}

    // 3. Location
    setPromptStep("3/4: Requesting Location access...");
    try {
      if (navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(),
            () => resolve(),
            { timeout: 8000 }
          );
        });
      }
    } catch {}

    // 4. Notifications
    setPromptStep("4/4: Requesting Notifications permission...");
    try {
      if (typeof Notification !== "undefined") {
        await Notification.requestPermission();
      }
    } catch {}

    setPromptStep("Probe complete! System permissions saved in your device & browser settings.");
    setPromptingAll(false);
    await refreshSystemStatuses();
  };

  const pickedTest = (cap: PermissionCapability, files: FileList | null) => {
    const n = files?.length ?? 0;
    setTestResults((prev) => ({ ...prev, [cap]: n ? { status: "success", message: `Read ${files![0].name} (${Math.round(files![0].size / 1024)} KB).` } : { status: "error", message: "Nothing was picked." } }));
  };

  // Test / prompt device access directly from settings
  const handleTestCapability = async (cap: PermissionCapability) => {
    const native = (window as any).Capacitor?.isNativePlatform?.() ? (window as any).Capacitor : null;
    setTestResults((prev) => ({
      ...prev,
      [cap]: { status: "testing", message: "Connecting to hardware..." },
    }));

    try {
      if (cap === "camera") {
        if (typeof navigator.mediaDevices?.getUserMedia !== "function") throw new Error("Camera not supported on this browser");
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280 } });
        stream.getTracks().forEach((t) => t.stop());
        setTestResults((prev) => ({ ...prev, [cap]: { status: "success", message: "Camera stream verified & accessible." } }));
        refreshSystemStatuses();
      } else if (cap === "microphone") {
        if (typeof navigator.mediaDevices?.getUserMedia !== "function") throw new Error("Microphone not supported on this browser");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        setTestResults((prev) => ({ ...prev, [cap]: { status: "success", message: "Audio capture verified & responsive." } }));
        refreshSystemStatuses();
      } else if (cap === "location") {
        if (!navigator.geolocation) throw new Error("Geolocation not supported on this device");
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setTestResults((prev) => ({
              ...prev,
              [cap]: { status: "success", message: `Location verified (lat: ${pos.coords.latitude.toFixed(2)}, lon: ${pos.coords.longitude.toFixed(2)}).` },
            }));
            refreshSystemStatuses();
          },
          (err) => {
            setTestResults((prev) => ({
              ...prev,
              [cap]: { status: "error", message: err.message || "Location request denied." },
            }));
            refreshSystemStatuses();
          },
          { timeout: 8000 }
        );
      } else if (cap === "notifications") {
        // Inside the Android or iPhone app the WebView has no Notification API;
        // the native prompt (Android 13+ POST_NOTIFICATIONS) comes from the plugin.
        const push = native?.Plugins?.PushNotifications;
        if (push) {
          const r = await push.requestPermissions();
          setTestResults((prev) => ({ ...prev, [cap]: { status: r.receive === "granted" ? "success" : "error", message: `Notification permission: ${r.receive}.` } }));
          return;
        }
        if (typeof Notification === "undefined") throw new Error("Notifications not supported");
        const res = await Notification.requestPermission();
        setTestResults((prev) => ({
          ...prev,
          [cap]: { status: res === "granted" ? "success" : "error", message: `Notification permission: ${res}.` },
        }));
        refreshSystemStatuses();
      } else if (cap === "files") {
        // Passes only once a file is actually picked (see the input's onChange).
        fileTestInputRef.current?.click();
        setTestResults((prev) => ({ ...prev, [cap]: { status: "testing", message: "Pick a file to confirm access." } }));
      } else if (cap === "photos") {
        photoTestInputRef.current?.click();
        setTestResults((prev) => ({ ...prev, [cap]: { status: "testing", message: "Pick a photo to confirm access." } }));
      } else if (cap === "contacts") {
        const nav = navigator as any;
        const book = native?.Plugins?.Contacts;
        if (book) {
          const r = await book.requestPermissions();
          const yes = r.contacts === "granted" || r.contacts === "limited";
          setTestResults((prev) => ({ ...prev, [cap]: { status: yes ? "success" : "error", message: yes ? "Address book access allowed." : "Contacts access is off. Turn it on in the phone's Settings." } }));
        } else if ("contacts" in nav && "ContactsManager" in window) {
          const c = await nav.contacts.select(["name"], { multiple: false });
          setTestResults((prev) => ({ ...prev, [cap]: { status: c?.length ? "success" : "error", message: c?.length ? "Contacts picker works." : "No contact was picked." } }));
        } else {
          setTestResults((prev) => ({ ...prev, [cap]: { status: "error", message: "This browser can't read contacts. Use the JARVIS phone app, or import a .vcf file." } }));
        }
      } else if (cap === "bluetooth") {
        const nav = navigator as any;
        if (nav.bluetooth?.requestDevice) {
          setTestResults((prev) => ({ ...prev, [cap]: { status: "success", message: "Web Bluetooth is available in this browser." } }));
        } else {
          setTestResults((prev) => ({ ...prev, [cap]: { status: "error", message: "This browser has no Bluetooth access." } }));
        }
      } else if (cap === "motion") {
        if (typeof (DeviceOrientationEvent as any)?.requestPermission === "function") {
          const res = await (DeviceOrientationEvent as any).requestPermission();
          setTestResults((prev) => ({ ...prev, [cap]: { status: res === "granted" ? "success" : "error", message: `Motion permission: ${res}.` } }));
        } else {
          const has = typeof window !== "undefined" && "DeviceMotionEvent" in window;
          setTestResults((prev) => ({ ...prev, [cap]: { status: has ? "success" : "error", message: has ? "Motion sensors are available." : "This device reports no motion sensors." } }));
        }
      } else if (cap === "wakeLock") {
        if ("wakeLock" in navigator) {
          const lock = await (navigator as any).wakeLock.request("screen");
          await lock.release();
          setTestResults((prev) => ({ ...prev, [cap]: { status: "success", message: "Screen stay awake lock verified." } }));
        } else {
          setTestResults((prev) => ({ ...prev, [cap]: { status: "error", message: "This browser can't keep the screen awake." } }));
        }
      } else if (cap === "vibration") {
        if (typeof navigator.vibrate === "function") {
          navigator.vibrate([40, 30, 40]);
          setTestResults((prev) => ({ ...prev, [cap]: { status: "success", message: "Haptic vibration pulse triggered." } }));
        } else {
          setTestResults((prev) => ({ ...prev, [cap]: { status: "error", message: "This browser can't vibrate (iPhone browsers have no vibration API)." } }));
        }
      } else if (cap === "clipboard") {
        if (navigator.clipboard) {
          setTestResults((prev) => ({ ...prev, [cap]: { status: "success", message: "Clipboard read/write API accessible." } }));
        } else {
          setTestResults((prev) => ({ ...prev, [cap]: { status: "error", message: "Clipboard API restricted." } }));
        }
      } else if (cap === "battery") {
        const nav = navigator as any;
        if (typeof nav.getBattery === "function") {
          const b = await nav.getBattery();
          setTestResults((prev) => ({
            ...prev,
            [cap]: { status: "success", message: `Battery diagnostic active (${Math.round(b.level * 100)}% remaining).` },
          }));
        } else {
          setTestResults((prev) => ({ ...prev, [cap]: { status: "error", message: "This browser doesn't report battery level." } }));
        }
      } else if (cap === "screen") {
        if (typeof navigator.mediaDevices?.getDisplayMedia === "function") {
          setTestResults((prev) => ({ ...prev, [cap]: { status: "success", message: "Screen capture API ready." } }));
        } else {
          setTestResults((prev) => ({ ...prev, [cap]: { status: "error", message: "Screen capture not supported on this platform." } }));
        }
      }
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [cap]: { status: "error", message: err?.message || "Permission test failed." },
      }));
    }
  };

  if (!policies) return null;

  return (
    <div className="mt-6 rounded-card border border-border-default bg-background-surface/40 p-5 space-y-6">
      {/* Test inputs */}
      <input ref={fileTestInputRef} type="file" className="sr-only opacity-0 absolute w-px h-px pointer-events-none -z-10" aria-hidden="true" onChange={(e) => pickedTest("files", e.target.files)} />
      <input ref={photoTestInputRef} type="file" accept="image/*" className="sr-only opacity-0 absolute w-px h-px pointer-events-none -z-10" aria-hidden="true" onChange={(e) => pickedTest("photos", e.target.files)} />

      {/* Header with App Settings & Cross-Platform Link */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border-default">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {platformInfo.isLaptop ? (
              <Laptop size={18} className="text-[#4FC3F7]" />
            ) : (
              <Smartphone size={18} className="text-[#4FC3F7]" />
            )}
            <h2 className="text-base font-semibold text-text-primary">Phone App Settings & Device Access</h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/25 hidden sm:inline-block">
              Mobile &amp; Laptop Compatible
            </span>
          </div>
          <p className="text-xs text-text-muted max-w-2xl leading-relaxed">
            Configure access to documents, camera, location, contacts, and sensors. Just like any native
            application on your phone or laptop, every capability is declared separately in device settings and within JARVIS.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenSettings}
          className="flex items-center gap-2 px-3.5 py-2 rounded-input bg-gradient-to-r from-[#4FC3F7]/20 to-[#0288D1]/20 hover:from-[#4FC3F7]/30 hover:to-[#0288D1]/30 border border-[#4FC3F7]/40 text-[#4FC3F7] text-xs font-medium transition-all shadow-sm flex-none w-fit"
          title="Open device settings and configure permissions on phone or laptop"
        >
          {platformInfo.isLaptop ? <Laptop size={14} /> : <ExternalLink size={14} />}
          <span>Open Phone Device Settings</span>
          <span className="text-[10px] text-text-muted font-mono hidden sm:inline">(Mobile &amp; Laptop)</span>
        </button>
      </div>

      {/* Platform Device Guide Pill */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-card bg-background-elevated/60 border border-border-default text-xs text-text-secondary">
        <Info size={14} className="text-[#4FC3F7] flex-none" />
        <span className="font-medium text-text-primary">Where to find these in your phone or laptop:</span>
        <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-[11px]">
          iOS: Settings → JARVIS OS
        </span>
        <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-[11px]">
          Android: Settings → Apps → JARVIS OS → Permissions
        </span>
        <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-[11px]">
          Laptop: Browser Address Bar 🔒 / 🎛️ → Permissions
        </span>
      </div>

      {/* Desktop / Browser Help Modal Banner & Interactive Guide */}
      {showDesktopHelp && (
        <div className="p-4 rounded-card bg-[#4FC3F7]/10 border border-[#4FC3F7]/30 text-xs text-text-secondary space-y-3.5 animate-in fade-in">
          <div className="flex items-start justify-between gap-3 border-b border-[#4FC3F7]/20 pb-3">
            <div className="space-y-1">
              <div className="font-semibold text-text-primary flex items-center gap-2 text-sm">
                <ShieldCheck size={16} className="text-[#4FC3F7]" />
                Device App Settings Guide
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-[#4FC3F7] border border-white/10">
                  {platformInfo.isIOS
                    ? "📱 iPhone / iPad (iOS Safari)"
                    : platformInfo.isMac
                    ? "💻 Mac Laptop / Desktop"
                    : platformInfo.isWindows
                    ? "💻 Windows Laptop / PC"
                    : platformInfo.isAndroid
                    ? "🤖 Android"
                    : "💻 Laptop & Mobile"}
                </span>
              </div>
              <p className="text-text-muted leading-relaxed">
                Step-by-step instructions to configure system permissions on phone and laptop, plus 1-click permission verification.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDesktopHelp(false)}
              className="text-text-muted hover:text-text-primary text-xs px-2.5 py-1 rounded bg-background-surface border border-border-default flex-none flex items-center gap-1"
            >
              <X size={12} />
              <span>Dismiss</span>
            </button>
          </div>

          {/* Quick Hardware Prompt Action */}
          <div className="p-3 rounded-card bg-background-surface/80 border border-border-default flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-medium text-text-primary text-xs flex items-center gap-1.5">
                <Sparkles size={13} className="text-[#4FC3F7]" />
                <span>Grant &amp; Test All Device Permissions</span>
              </div>
              <p className="text-[11px] text-text-muted mt-0.5">
                Triggers native browser prompts for Camera, Microphone, Location &amp; Alerts in sequence. Once allowed, your device permanently saves them.
              </p>
              {promptStep && (
                <div className="mt-1.5 text-[11px] text-[#4FC3F7] font-mono flex items-center gap-1.5">
                  {promptingAll ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} className="text-emerald-400" />}
                  <span>{promptStep}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handlePromptAllPermissions}
              disabled={promptingAll}
              className="px-3 py-1.5 rounded-input bg-[#4FC3F7] text-[#07070F] text-xs font-semibold hover:bg-[#38b6f0] transition-colors flex-none flex items-center gap-1.5 disabled:opacity-50"
            >
              {promptingAll ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
              <span>{promptingAll ? "Prompting..." : "Prompt All Now"}</span>
            </button>
          </div>

          {/* Platform Specific Steps */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
            {/* iPhone / iPad */}
            <div className={cn(
              "p-3 rounded-card border text-xs space-y-1.5",
              platformInfo.isIOS ? "bg-[#4FC3F7]/15 border-[#4FC3F7]/40 ring-1 ring-[#4FC3F7]/30" : "bg-background-surface/50 border-border-default"
            )}>
              <div className="font-semibold text-text-primary flex items-center gap-1.5">
                <Smartphone size={13} className="text-[#4FC3F7]" />
                <span>iPhone &amp; iPad (iOS Safari / Chrome)</span>
                {platformInfo.isIOS && <span className="text-[10px] text-[#4FC3F7] font-mono uppercase ml-auto">Detected</span>}
              </div>
              <ol className="list-decimal list-inside text-text-muted space-y-1 text-[11px] leading-relaxed">
                <li>Tap <strong>aA</strong> in the Safari address bar (left or bottom).</li>
                <li>Tap <strong>Website Settings</strong>.</li>
                <li>Set <strong>Camera</strong>, <strong>Microphone</strong> &amp; <strong>Location</strong> to <strong>Allow</strong>.</li>
                <li>Or open iPhone <strong>Settings → JARVIS OS</strong> (or Safari) to toggle access.</li>
              </ol>
            </div>

            {/* Mac Laptop & Desktop */}
            <div className={cn(
              "p-3 rounded-card border text-xs space-y-1.5",
              platformInfo.isMac || (!platformInfo.isIOS && !platformInfo.isAndroid) ? "bg-[#4FC3F7]/15 border-[#4FC3F7]/40 ring-1 ring-[#4FC3F7]/30" : "bg-background-surface/50 border-border-default"
            )}>
              <div className="font-semibold text-text-primary flex items-center gap-1.5">
                <Laptop size={13} className="text-[#4FC3F7]" />
                <span>Mac Laptop &amp; Desktop (Safari / Chrome)</span>
                {(platformInfo.isMac || platformInfo.isLaptop) && <span className="text-[10px] text-[#4FC3F7] font-mono uppercase ml-auto">Detected</span>}
              </div>
              <ol className="list-decimal list-inside text-text-muted space-y-1 text-[11px] leading-relaxed">
                <li>In Chrome/Edge: Click the <strong>Tune 🎛️ or Padlock 🔒</strong> icon in the address bar.</li>
                <li>In Safari: Menu bar → <strong>Safari → Settings for this Website...</strong></li>
                <li>Set <strong>Camera</strong>, <strong>Microphone</strong> &amp; <strong>Location</strong> to <strong>Allow</strong>.</li>
                <li>Check <strong>System Settings → Privacy &amp; Security</strong> if blocked globally.</li>
              </ol>
            </div>

            {/* Windows Laptop */}
            <div className={cn(
              "p-3 rounded-card border text-xs space-y-1.5",
              platformInfo.isWindows ? "bg-[#4FC3F7]/15 border-[#4FC3F7]/40 ring-1 ring-[#4FC3F7]/30" : "bg-background-surface/50 border-border-default"
            )}>
              <div className="font-semibold text-text-primary flex items-center gap-1.5">
                <Laptop size={13} className="text-[#4FC3F7]" />
                <span>Windows Laptop / PC (Chrome / Edge / Firefox)</span>
                {platformInfo.isWindows && <span className="text-[10px] text-[#4FC3F7] font-mono uppercase ml-auto">Detected</span>}
              </div>
              <ol className="list-decimal list-inside text-text-muted space-y-1 text-[11px] leading-relaxed">
                <li>Click the <strong>Tune 🎛️ or Padlock 🔒</strong> icon to the left of the address bar.</li>
                <li>Toggle <strong>Camera</strong>, <strong>Microphone</strong> &amp; <strong>Location</strong> to <strong>On</strong>.</li>
                <li>Ensure Windows <strong>Settings → Privacy → Camera/Microphone</strong> allows browser access.</li>
              </ol>
            </div>

            {/* Android */}
            <div className={cn(
              "p-3 rounded-card border text-xs space-y-1.5",
              platformInfo.isAndroid ? "bg-[#4FC3F7]/15 border-[#4FC3F7]/40 ring-1 ring-[#4FC3F7]/30" : "bg-background-surface/50 border-border-default"
            )}>
              <div className="font-semibold text-text-primary flex items-center gap-1.5">
                <Smartphone size={13} className="text-[#4FC3F7]" />
                <span>Android (Chrome / Samsung Internet)</span>
                {platformInfo.isAndroid && <span className="text-[10px] text-[#4FC3F7] font-mono uppercase ml-auto">Detected</span>}
              </div>
              <ol className="list-decimal list-inside text-text-muted space-y-1 text-[11px] leading-relaxed">
                <li>Tap the <strong>Padlock 🔒 or Tune icon</strong> next to the URL.</li>
                <li>Tap <strong>Permissions</strong> → Enable <strong>Camera, Microphone &amp; Location</strong>.</li>
                <li>Or open <strong>Settings → Apps → JARVIS OS → Permissions</strong>.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Categorized Permissions Grid */}
      <div className="space-y-6">
        {PERMISSION_CATEGORIES.map((cat) => {
          const CategoryIcon = cat.icon;
          return (
            <div key={cat.id} className="rounded-card border border-border-default bg-background-elevated/30 p-4 space-y-3">
              {/* Category Header */}
              <div className="flex items-start justify-between gap-2 border-b border-border-default pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-[#4FC3F7]/10 border border-[#4FC3F7]/20 flex items-center justify-center">
                    <CategoryIcon size={14} className="text-[#4FC3F7]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">{cat.title}</h3>
                    <p className="text-[11px] text-text-muted">{cat.description}</p>
                  </div>
                </div>
                <div className="text-[10px] text-text-muted font-mono hidden md:block">
                  {cat.devicePathHint}
                </div>
              </div>

              {/* Items within this category */}
              <div className="divide-y divide-border-default">
                {cat.capabilities.map((cap) => {
                  const meta = CAP_META[cap];
                  if (!meta) return null;
                  const Icon = meta.icon;
                  const policy = policies[cap] || "ask";
                  const sysStatus = systemStatuses[cap];
                  const test = testResults[cap];

                  return (
                    <div key={cap} className="py-3 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Left: Icon & Description */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-background-surface border border-border-default flex items-center justify-center flex-none mt-0.5">
                          <Icon size={15} className="text-[#4FC3F7]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-text-primary">{meta.label}</span>

                            {/* System Status Badge */}
                            {sysStatus === "granted" && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 size={10} /> Allowed
                              </span>
                            )}
                            {sysStatus === "denied" && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 border border-red-500/20">
                                <AlertCircle size={10} /> Blocked in Settings
                              </span>
                            )}
                            {sysStatus === "prompt" && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/20">
                                Prompt on use
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-text-muted mt-0.5 leading-snug">{meta.reason}</p>

                          {/* Test Result Message */}
                          {test && (
                            <div className={cn(
                              "mt-1.5 text-[11px] flex items-center gap-1.5",
                              test.status === "testing" ? "text-amber-400" :
                              test.status === "success" ? "text-emerald-400" : "text-red-400"
                            )}>
                              {test.status === "testing" && <RefreshCw size={11} className="animate-spin" />}
                              {test.status === "success" && <CheckCircle2 size={11} />}
                              {test.status === "error" && <AlertCircle size={11} />}
                              <span>{test.message}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions (Prompt/Test Button & Policy Toggle) */}
                      <div className="flex items-center gap-2 self-end sm:self-center flex-none">
                        {/* Test / Prompt Button */}
                        <button
                          type="button"
                          onClick={() => handleTestCapability(cap)}
                          className="px-2.5 py-1 rounded-input border border-border-default hover:border-[#4FC3F7]/40 bg-background-surface hover:bg-[#4FC3F7]/10 text-[11px] text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
                          title="Trigger hardware prompt or verify device access"
                        >
                          <Sparkles size={11} className="text-[#4FC3F7]" />
                          <span>Test Access</span>
                        </button>

                        {/* In-App Policy Selector */}
                        <div className="flex rounded-input border border-border-default overflow-hidden text-xs bg-background-surface">
                          {(["always", "ask"] as PermissionPolicy[]).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setPolicy(cap, p)}
                              className={cn(
                                "px-2.5 py-1 text-[11px] transition-colors",
                                policy === p
                                  ? "bg-[#4FC3F7] text-[#07070F] font-semibold shadow-xs"
                                  : "text-text-muted hover:text-text-primary"
                              )}
                            >
                              {p === "always" ? "Always" : "Ask"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
