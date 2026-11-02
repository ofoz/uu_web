import { ArrowRight, Github, MoveUpRight } from "lucide-react";
import { Link } from "react-router";

import { preloadProductRoutes } from "../routeLoaders.js";
import { BrandLogo } from "./BrandLogo.js";

const GITHUB_URL = "https://github.com/ofoz/uu_web";
const V2EX_URL = "https://www.v2ex.com/t/1225978";

function BrowserBar({ address, dark = false }: { address?: string; dark?: boolean }) {
  return (
    <div className={`landing-browser-bar${dark ? " landing-browser-bar-dark" : ""}`} aria-hidden="true">
      <span className="landing-browser-dots">
        <span />
        <span />
        <span />
      </span>
      {address ? <span className="landing-browser-address">{address}</span> : null}
    </div>
  );
}

export function LandingPage({ loggedIn }: { loggedIn: boolean }) {
  const consolePath = loggedIn ? "/devices" : "/login";

  return (
    <main className="landing-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <a className="landing-brand" href="/" aria-label="UU Remote 首页">
            <span className="landing-brand-mark" aria-hidden="true">
              <BrandLogo size={30} />
            </span>
            <span>UU Remote</span>
          </a>
          <nav className="landing-nav" aria-label="首页导航">
            <a className="landing-nav-github" href={GITHUB_URL} target="_blank" rel="noreferrer">
              <Github size={16} />
              <span>GitHub</span>
            </a>
            <Link
              className="landing-nav-action"
              to={consolePath}
              onFocus={preloadProductRoutes}
              onMouseEnter={preloadProductRoutes}
              onPointerDown={preloadProductRoutes}
            >
              进入控制台
            </Link>
          </nav>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-content">
          <p className="landing-eyebrow">
            <span aria-hidden="true" />
            UU Remote · 非官方开源项目
          </p>
          <h1 id="landing-title">UU 远程桌面</h1>
          <p className="landing-hero-description">
            连接并控制你的 UU 远程设备，无需安装官方主控客户端；支持短信登录、设备列表与实时远控。
          </p>
          <div className="landing-actions">
            <Link
              className="landing-primary-action"
              to={consolePath}
              onFocus={preloadProductRoutes}
              onMouseEnter={preloadProductRoutes}
              onPointerDown={preloadProductRoutes}
            >
              进入控制台
              <ArrowRight size={18} />
            </Link>
            <a className="landing-secondary-action" href={GITHUB_URL} target="_blank" rel="noreferrer">
              查看源码
              <MoveUpRight size={15} />
            </a>
          </div>
          <p className="landing-action-note">短信登录，也支持导入已有账号凭证。</p>

          <figure className="landing-hero-window">
            <BrowserBar address="uurc.678234.xyz" />
            <img src="/product/device-list.png" alt="UU Remote 设备列表界面" width="1440" height="821" />
          </figure>
        </div>
      </section>

      <section className="landing-workflow" aria-labelledby="workflow-title">
        <div className="landing-workflow-inner">
          <div className="landing-section-heading">
            <p className="landing-section-index">使用流程</p>
            <h2 id="workflow-title">从登录到远控</h2>
            <p>登录后选择在线设备，连接完成即可查看画面和发送输入。</p>
          </div>

          <div className="landing-steps">
            <article className="landing-step">
              <div className="landing-step-copy">
                <span className="landing-step-badge">
                  <span>01</span>· 登录
                </span>
                <h3>使用手机号验证码登录</h3>
                <p>也可以导入已有账号凭证，省去重复登录。</p>
              </div>
              <div className="landing-login-stage">
                <figure className="landing-media landing-media-login">
                  <BrowserBar />
                  <img src="/product/login.png" alt="UU Remote 手机号验证码登录页面" width="960" height="680" />
                </figure>
              </div>
            </article>

            <article className="landing-step">
              <div className="landing-step-copy">
                <span className="landing-step-badge">
                  <span>02</span>· 设备
                </span>
                <h3>在线设备一眼可见</h3>
                <p>从列表选择自己的设备，也可以输入设备 ID 发起伙伴协助。</p>
              </div>
              <figure className="landing-media">
                <BrowserBar />
                <img src="/product/device-list.png" alt="UU Remote 设备列表页面" width="1440" height="821" />
              </figure>
            </article>

            <article className="landing-step landing-step-last">
              <div className="landing-step-copy">
                <span className="landing-step-badge">
                  <span>03</span>· 远控
                </span>
                <h3>连接后直接开始控制</h3>
                <p>画面、输入、声音和剪贴板集中在同一个会话界面。</p>
              </div>
              <figure className="landing-media landing-media-dark">
                <BrowserBar dark />
                <img src="/product/remote-session.png" alt="UU Remote 远程控制会话页面" width="1440" height="861" />
              </figure>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-final" aria-labelledby="landing-final-title">
        <div className="landing-final-content">
          <p className="landing-section-index">UU Remote</p>
          <h2 id="landing-final-title">准备开始？</h2>
          <p>短信登录，也支持导入已有账号凭证。</p>
          <div className="landing-final-actions">
            <Link
              className="landing-primary-action"
              to={consolePath}
              onFocus={preloadProductRoutes}
              onMouseEnter={preloadProductRoutes}
              onPointerDown={preloadProductRoutes}
            >
              进入控制台
              <ArrowRight size={18} />
            </Link>
            <a className="landing-secondary-action" href={GITHUB_URL} target="_blank" rel="noreferrer">
              查看源码
              <MoveUpRight size={15} />
            </a>
          </div>
        </div>

        <footer className="landing-footer">
          <div className="landing-footer-inner">
            <p>
              UU Remote 是非官方开源项目，与网易及 UU 远程没有关联。请确认你信任当前部署，仅用于交流学习和个人使用。
            </p>
            <div>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                GitHub
              </a>
              <a href={V2EX_URL} target="_blank" rel="noreferrer">
                V2EX 原帖
              </a>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}
