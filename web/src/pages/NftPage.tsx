import { useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { SectionCard } from "../components/SectionCard";
import { erc721EnumerableAbi } from "../abi/common";
import { contracts } from "../config/contracts";
import { bscChain } from "../config/chains";
import { useDappAccess } from "../hooks/useDappAccess";

export function NftPage() {
  const access = useDappAccess();
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
        <div className="contract-ribbon">NFT 權益</div>
        <p className="hero-contract-label">NFT CONTRACT</p>
        <div className="contract-address-box">
          <span className="contract-address-full">{nftAddress || "待配置"}</span>
          <span className="contract-address-compact">
            {nftAddress ? `${nftAddress.slice(0, 16)}...${nftAddress.slice(-12)}` : "待配置"}
          </span>
          <button type="button" className="icon-button" onClick={() => void copyAddress()} disabled={!nftAddress}>
            {copiedAddress ? "已複製" : "複製"}
          </button>
        </div>
        <div className="hero-contract-meta">
          <div>
            <span>最大供應</span>
            <strong>420</strong>
          </div>
        </div>
        {hasElementCollectionUrl ? (
          <a href={elementCollectionUrl} target="_blank" rel="noreferrer" className="hero-link-button">
            前往 Element 購買
          </a>
        ) : (
          <button type="button" className="hero-link-button nft-market-button-disabled" disabled>
            Element 購買入口待開放
          </button>
        )}
      </div>

      <SectionCard title="NFT 編號" description={access.isConnected ? undefined : "連接後查看。"} className="nft-index-card">
        <div className="token-showcase-grid">
          {ownedTokens.data?.length ? (
            ownedTokens.data.map((item, index) => (
              <div key={index} className="token-chip-card">
                <span>分紅銀行 NFT</span>
                <strong>#{item.result?.toString() || "--"}</strong>
              </div>
            ))
          ) : (
            <div className="empty-state">{access.activeAddress ? "目前沒有持有中的 NFT" : "連接錢包後查看持有清單"}</div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
