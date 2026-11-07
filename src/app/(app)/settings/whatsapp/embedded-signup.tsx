"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Alert, Button } from "@/components/ui";
import { completeEmbeddedSignup } from "../actions";

type FBLoginResponse = { authResponse?: { code?: string } | null };
type FB = {
  init(o: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(cb: (r: FBLoginResponse) => void, o: Record<string, unknown>): void;
};
declare global {
  interface Window {
    FB?: FB;
    fbAsyncInit?: () => void;
  }
}

/** Meta's Embedded Signup popup: the customer picks or creates their WhatsApp Business Account and number. */
export function EmbeddedSignup({ appId, configId, version }: { appId: string; configId: string; version: string }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const session = useRef<{ phoneNumberId?: string; wabaId?: string }>({});

  useEffect(() => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      setReady(true);
    };
    if (!document.getElementById("facebook-jssdk")) {
      const s = document.createElement("script");
      s.id = "facebook-jssdk";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      s.async = true;
      s.crossOrigin = "anonymous";
      document.body.appendChild(s);
    } else if (window.FB) {
      window.fbAsyncInit();
    }
    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/([\w-]+\.)?facebook\.com$/.test(e.origin)) return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH") {
          session.current = { phoneNumberId: data.data?.phone_number_id, wabaId: data.data?.waba_id };
        }
      } catch {
        // other facebook.com messages aren't JSON
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [appId, version]);

  const launch = () => {
    setError(null);
    window.FB?.login(
      (r) => {
        const code = r.authResponse?.code;
        const { phoneNumberId, wabaId } = session.current;
        if (!code) return setError("Sign-up was closed before it finished.");
        if (!phoneNumberId || !wabaId) return setError("Meta didn't share the number. Finish every step in the popup, then try again.");
        start(async () => {
          const res = await completeEmbeddedSignup(code, phoneNumberId, wabaId);
          if (res?.error) setError(res.error);
        });
      },
      { config_id: configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, sessionInfoVersion: "3" } },
    );
  };

  return (
    <div className="space-y-2">
      {error && <Alert tone="danger">{error}</Alert>}
      <Button className="w-full" onClick={launch} disabled={!ready || pending}>
        {pending ? "Connecting…" : "Connect with Facebook"}
      </Button>
      <p className="text-xs text-muted">Log in with Facebook, pick your business and number, and you&apos;re done. No tokens to copy.</p>
    </div>
  );
}
