import { useEffect, useState } from "react";

import type { AuthStatus } from "@uurc/shared/authState";

export function useAccountController() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authJson, setAuthJson] = useState("");
  const [regionCode, setRegionCode] = useState("86");
  const [mobile, setMobile] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);

  useEffect(() => {
    if (smsCountdown <= 0) return;
    const timer = window.setInterval(() => setSmsCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [smsCountdown]);

  return {
    authStatus,
    setAuthStatus,
    authJson,
    setAuthJson,
    regionCode,
    setRegionCode,
    mobile,
    setMobile,
    smsCode,
    setSmsCode,
    loginNotice,
    setLoginNotice,
    codeSent,
    setCodeSent,
    smsCountdown,
    setSmsCountdown,
  };
}
