import { useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { SectionCard } from "../components/SectionCard";
import { erc721EnumerableAbi } from "../abi/common";
import { contracts } from "../config/contracts";
import { bscChain } from "../config/chains";
import { useDappAccess } from "../hooks/useDappAccess";
import { useI18n } from "../i18n/LanguageProvider";

export function NftPage() {
  const access = useDappAccess();
  const { t } = useI18n();
  const [copiedAddress, setCopiedAddress] = useState(false);
  const nftAddress = contracts.dividendBankNft;
  const elementCollectionUrl = import.meta.env.VITE_ELEMENT_NFT_URL;
  const hasElementCollectionUrl = typeof elementCollectionUrl === "string" && elementCollectionUrl.length > 0;

  const balance = useReadContract({
    address: contracts.dividendBankNft,
    chainId: bscChain.id,
    abi: erc721EnumerableAbi,
    functionName: "balanceOf",
    args: [access.activeAddress!],
    query: {
      enabled: Boolean(contracts.dividendBankNft && access.activeAddress),
    },
  });

  const tokenQueries =
    balance.data && contracts.dividendBankNft && access.activeAddress
      ? Array.from({ length: Number(balance.data) }, (_, index) => ({
          address: contracts.dividendBankNft!,
          abi: erc721EnumerableAbi,
          functionName: "tokenOfOwnerByIndex" as const,
          args: [access.activeAddress, BigInt(index)] as const,
        }))
      : [];

  const ownedTokens = useReadContracts({
    contracts: tokenQueries.map((item) => ({ ...item, chainId: bscChain.id })),
    query: {
      enabled: tokenQueries.length > 0,
    },
  });

  async function copyAddress() {
    if (!nftAddress) return;
    await navigator.clipboard.writeText(nftAddress);
    setCopiedAddress(true);
    window.setTimeout(() => setCopiedAddress(false), 1800);
  }

  return (
    <div className="vault-page-stack">
      <div className="hero-contract-card nft-contract-card">
        <div className="contract-ribbon">{t("nft.ribbon")}</div>
        <p className="hero-contract-label">{t("nft.contractLabel")}</p>
        <div className="contract-address-box">
          <span className="contract-address-full">{nftAddress || t("common.pendingConfig")}</span>
          <span className="contract-address-compact">
            {nftAddress ? `${nftAddress.slice(0, 16)}...${nftAddress.slice(-12)}` : t("common.pendingConfig")}
          </span>
          <button type="button" className="icon-button" onClick={() => void copyAddress()} disabled={!nftAddress}>
            {copiedAddress ? t("common.copied") : t("common.copy")}
          </button>
        </div>
        <div className="hero-contract-meta">
          <div>
            <span>{t("nft.maxSupply")}</span>
            <strong>420</strong>
          </div>
        </div>
        {hasElementCollectionUrl ? (
          <a href={elementCollectionUrl} target="_blank" rel="noreferrer" className="hero-link-button">
            {t("nft.buyOnElement")}
          </a>
        ) : (
          <button type="button" className="hero-link-button nft-market-button-disabled" disabled>
            {t("nft.marketSoon")}
          </button>
        )}
      </div>

      <SectionCard title={t("nft.tokenIds")} description={access.isConnected ? undefined : t("common.connectToView")} className="nft-index-card">
        <div className="token-showcase-grid">
          {ownedTokens.data?.length ? (
            ownedTokens.data.map((item, index) => (
              <div key={index} className="token-chip-card">
                <span>{t("nft.cardLabel")}</span>
                <strong>#{item.result?.toString() || "--"}</strong>
              </div>
            ))
          ) : (
            <div className="empty-state">{access.activeAddress ? t("nft.noHoldings") : t("nft.connectToViewList")}</div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
