import { useEffect, useRef, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { WalletPanel } from "./WalletPanel";
import { bscChain } from "../config/chains";
import { useAdminAccess } from "../hooks/useAdminAccess";
import { useDappAccess } from "../hooks/useDappAccess";
import { useReferralLanding } from "../hooks/useReferralLanding";
import { useSoundEffects } from "../hooks/useSoundEffects";

const publicNavItems = [
  { to: "/", label: "🏦 分紅總覽", mobileLabel: "總覽" },
  { to: "/play", label: "🎲 遊戲終端", mobileLabel: "遊戲" },
  { to: "/nft", label: "🪙 NFT 權益", mobileLabel: "NFT" },
  { to: "/revenue", label: "💰 分紅金庫", mobileLabel: "分紅" },
  { to: "/referrals", label: "🤝 邀請獎勵", mobileLabel: "邀請" },
];

const featuredContractAddress = "0x1b2884470a5de9a39dc234a20141146de6b67777";
const priceCacheKey = "dividend-bank-token-price-cache";
const priceCacheTtlMs = 24 * 60 * 60 * 1000;

type TokenPriceSnapshot = {
  fetchedAt: number;
  priceUsd: number | null;
};

function formatUsdPrice(value: number | null) {
  if (value === null || Number.isNaN(value)) return "--";

  const digits = value >= 1 ? 4 : value >= 0.01 ? 5 : 7;
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}`;
}

function Volume2Icon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function VolumeXIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

export function AppShell() {
  const location = useLocation();
  const access = useDappAccess({ trackEvents: true });
  useReferralLanding(access.address);
  const { hasAdminAccess, isLoading } = useAdminAccess(access.address);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [tokenPrice, setTokenPrice] = useState<TokenPriceSnapshot | null>(null);
  const hasHydratedWalletStateRef = useRef(false);
  const previousConnectedRef = useRef(access.isConnected);
  const sound = useSoundEffects();
  const contractAddress = featuredContractAddress;
  const isAdminRoute = location.pathname === "/admin";
  const isHomeRoute = location.pathname === "/";
  const isPlayRoute = location.pathname.startsWith("/play");
  const adminSessionActive = access.isConnected && hasAdminAccess;
  const allowDisconnectedPlay = isPlayRoute && !access.isConnected;
  const showDisconnectedLanding = !access.isConnected && !allowDisconnectedPlay;
  const showPageStage = access.isConnected || allowDisconnectedPlay;
  const showBottomNav = access.isConnected && !hasAdminAccess;
  const navItems = publicNavItems;

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timer = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    let cancelled = false;

    async function loadTokenPrice() {
      const cachedRaw = window.localStorage.getItem(priceCacheKey);
      if (cachedRaw) {
        try {
          const cached = JSON.parse(cachedRaw) as TokenPriceSnapshot;
          if (Date.now() - cached.fetchedAt < priceCacheTtlMs) {
            setTokenPrice(cached);
            return;
          }
        } catch {
          window.localStorage.removeItem(priceCacheKey);
        }
      }

      try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${featuredContractAddress}`);
        if (!response.ok) throw new Error(`Price request failed: ${response.status}`);

        const payload = await response.json() as {
          pairs?: Array<{
            liquidity?: { usd?: number };
            priceChange?: { h24?: number };
            priceUsd?: string;
          }>;
        };

        const bestPair = payload.pairs?.reduce((best, pair) => {
          const currentLiquidity = pair.liquidity?.usd ?? 0;
          const bestLiquidity = best?.liquidity?.usd ?? 0;
          return currentLiquidity > bestLiquidity ? pair : best;
        }, payload.pairs?.[0]);

        const nextSnapshot: TokenPriceSnapshot = {
          priceUsd: bestPair?.priceUsd ? Number(bestPair.priceUsd) : null,
          fetchedAt: Date.now(),
        };

        if (cancelled) return;

        setTokenPrice(nextSnapshot);
        window.localStorage.setItem(priceCacheKey, JSON.stringify(nextSnapshot));
      } catch {
        if (!cachedRaw || cancelled) return;

        try {
          const cached = JSON.parse(cachedRaw) as TokenPriceSnapshot;
          setTokenPrice(cached);
        } catch {
          window.localStorage.removeItem(priceCacheKey);
        }
      }
    }

    void loadTokenPrice();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasHydratedWalletStateRef.current) {
      hasHydratedWalletStateRef.current = true;
      previousConnectedRef.current = access.isConnected;
      return;
    }

    if (!previousConnectedRef.current && access.isConnected) {
      setToastMessage("錢包已連接");
    } else if (previousConnectedRef.current && !access.isConnected) {
      setToastMessage("錢包已斷開連接");
    }

    previousConnectedRef.current = access.isConnected;
  }, [access.address, access.isConnected]);

  if ((!access.isConnected || !hasAdminAccess) && isAdminRoute && !isLoading) {
    return <Navigate to="/" replace />;
  }

  if (adminSessionActive && !isAdminRoute && !isLoading) {
    return <Navigate to="/admin" replace />;
  }

  if (showDisconnectedLanding && !isHomeRoute) {
    return <Navigate to="/" replace />;
  }

  async function copyAddress() {
    if (!contractAddress) {
      setToastMessage("合約地址待公布");
      return;
    }
    await navigator.clipboard.writeText(contractAddress);
    sound.play("coin");
    setToastMessage("合約地址已複製");
  }

  return (
    <div className="app-shell-2026">
      {toastMessage ? (
        <div className="shell-toast">
          <span>{toastMessage}</span>
        </div>
      ) : null}

      <header className="site-header">
        <div className="site-header-inner">
          <div className="brand-cluster">
            <div className="brand-icon-box">
              <img src="/apple-touch-icon.png" alt="分紅銀行" className="brand-icon" />
            </div>
            <div className="brand-copy">
              <h1>分紅銀行</h1>
            </div>
          </div>

          <div className="header-controls">
            <button
              type="button"
              className={`sound-toggle-button ${sound.muted ? "muted" : "active"}`.trim()}
              onClick={sound.toggleMuted}
              aria-label={sound.muted ? "開啟音效" : "靜音"}
              title={sound.muted ? "開啟音效" : "靜音"}
            >
              {sound.muted ? <VolumeXIcon /> : <Volume2Icon />}
            </button>
            <WalletPanel />
          </div>
        </div>
      </header>

      <main className={`site-main ${showBottomNav ? "site-main-with-bottom-nav" : ""}`.trim()}>
        {!adminSessionActive && isHomeRoute ? (
          <>
            <section className="hero-banner">
              <div className="hero-banner-copy">
                <div className="hero-badge hero-badge-bouncy">🔥 鏈上分紅終端</div>
                <h2>
                  不靠體力，靠權益！
                  <span> 分紅銀行首創「遊戲通縮 + NFT 權益」雙驅動的最野模式。</span>
                </h2>
              </div>

              <div className="hero-contract-card">
                <div className="contract-ribbon">極品代幣</div>
                <p className="hero-contract-label">CONTRACT ADDRESS</p>
                <div className="contract-address-box">
                  <span className="contract-address-full">{contractAddress}</span>
                  <span className="contract-address-compact">{`${contractAddress.slice(0, 16)}...${contractAddress.slice(-12)}`}</span>
                  <button type="button" className="icon-button" onClick={() => void copyAddress()}>
                    複製
                  </button>
                </div>
                <div className="hero-contract-meta">
                  <div>
                    <span>發行總量</span>
                    <strong>1,000,000,000</strong>
                  </div>
                  <div>
                    <span>目前幣價</span>
                    <strong>{formatUsdPrice(tokenPrice?.priceUsd ?? null)}</strong>
                  </div>
                </div>
                <a
                  href={`${bscChain.blockExplorers.default.url}/address/${contractAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hero-link-button"
                >
                  <span>在 BscScan 查看</span>
                  <ArrowUpRightIcon />
                </a>
              </div>
            </section>

            {showDisconnectedLanding ? (
              <section className="landing-preview-shell">
                <div className="promo-card promo-card-gold landing-preview-feature">
                  <span className="promo-label">🪙 NFT 權益預覽</span>
                  <strong>不是裝飾品，是分紅資格。</strong>
                  <p>持有分紅銀行 NFT，即可參與每日收益分配。這不是單純收藏卡，而是鏈上可追蹤的收益權益憑證。</p>
                </div>

                <div className="landing-preview-side">
                  <div className="dense-card-grid">
                    <div className="promo-card">
                      <span>總供應</span>
                      <strong>420</strong>
                    </div>
                    <div className="promo-card">
                      <span>分紅權益</span>
                      <strong>每日快照分配</strong>
                    </div>
                    <div className="promo-card promo-card-violet landing-preview-wide">
                      <span>資產定位</span>
                      <strong>鏈上收益憑證</strong>
                    </div>
                  </div>

                  <div className="meme-bullet-card landing-preview-note">
                    <p>連接錢包後可查看持有數量、NFT 編號與當前分紅資格。</p>
                  </div>
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {showBottomNav ? (
          <nav className="tab-strip-shell" aria-label="主導航">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => sound.play("coin")}
                className={({ isActive }) => `tab-shell-link ${isActive ? "active" : ""}`.trim()}
              >
                <span className="tab-shell-label-desktop">{item.label}</span>
                <span className="tab-shell-label-mobile">{item.mobileLabel ?? item.label}</span>
              </NavLink>
            ))}
          </nav>
        ) : null}

        {access.isObserverMode ? (
          <div className="status-banner status-banner-observer">
            <strong>Observer Mode</strong>
            <span>目前為只讀查看模式，所有簽名交易已停用。</span>
          </div>
        ) : null}

        {access.isConnected && !access.onBsc ? (
          <div className="status-banner status-banner-warning">
            <strong>Wrong Network</strong>
            <span>公開資料仍可瀏覽，鏈上操作需切換至 {bscChain.name}。</span>
          </div>
        ) : null}

        {showPageStage ? (
          <section className="page-stage">
            <Outlet />
          </section>
        ) : null}
      </main>

    </div>
  );
}
