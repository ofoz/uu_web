import { useEffect } from "react";
import { useLocation } from "react-router";

const SITE_NAME = "UU Remote Web";
const SITE_URL = "https://uurc.678234.xyz";
const DEFAULT_DESCRIPTION =
  "UU Remote Web 是开源、自托管的非官方 UU 远程桌面网页版（Web 版）主控端，支持短信登录、设备列表、远控伙伴和浏览器远程控制。";
const DEFAULT_KEYWORDS =
  "UU 远程桌面网页版, UU 远程桌面 Web 版, UU 远程网页版, UU Remote Web, 网页远程桌面, 浏览器远程控制";

interface Metadata {
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
  themeColor: string;
}

const PRIVATE_ROBOTS = "noindex, nofollow, noarchive";

export function PageMetadata() {
  const { pathname } = useLocation();

  useEffect(() => {
    const metadata = getPageMetadata(pathname);
    const canonicalUrl = `${SITE_URL}${metadata.canonicalPath}`;

    document.title = metadata.title;
    setMeta("name", "description", metadata.description);
    setMeta("name", "keywords", DEFAULT_KEYWORDS);
    setMeta("name", "robots", metadata.robots);
    setMeta("name", "theme-color", metadata.themeColor);
    setMeta("property", "og:title", metadata.title);
    setMeta("property", "og:description", metadata.description);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("name", "twitter:title", metadata.title);
    setMeta("name", "twitter:description", metadata.description);
    setCanonical(canonicalUrl);
  }, [pathname]);

  return null;
}

function getPageMetadata(pathname: string): Metadata {
  if (pathname === "/") {
    return {
      title: `UU 远程桌面网页版（Web 版）- ${SITE_NAME}`,
      description: DEFAULT_DESCRIPTION,
      canonicalPath: "/",
      robots: "index, follow, max-image-preview:large",
      themeColor: "#fafafa",
    };
  }

  if (pathname === "/login") {
    return privateMetadata("登录", "/login", "登录 UU Remote Web，使用手机号验证码或导入已有账号凭证。");
  }
  if (pathname === "/devices") return privateMetadata("我的设备", "/devices");
  if (pathname === "/partner") return privateMetadata("远控伙伴", "/partner");
  if (pathname === "/account") return privateMetadata("账号与凭证", "/account");
  if (/^\/devices\/[^/]+\/control$/.test(pathname)) return privateMetadata("远程控制", pathname, "");

  return privateMetadata("页面", pathname);
}

function privateMetadata(label: string, canonicalPath: string, description = DEFAULT_DESCRIPTION): Metadata {
  return {
    title: `${label} | ${SITE_NAME}`,
    description,
    canonicalPath,
    robots: PRIVATE_ROBOTS,
    themeColor: canonicalPath.includes("/control") ? "#0b0b0c" : "#fafafa",
  };
}

function setMeta(attribute: "name" | "property", key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = content;
}

function setCanonical(url: string): void {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.append(element);
  }
  element.href = url;
}
