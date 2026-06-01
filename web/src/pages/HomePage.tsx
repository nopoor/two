import { useReadContract } from "wagmi";
import { SectionCard } from "../components/SectionCard";
import { erc20Abi, erc721EnumerableAbi } from "../abi/common";
import { contracts } from "../config/contracts";
import { bscChain } from "../config/chains";
import { useDappAccess } from "../hooks/useDappAccess";
import { useSoundEffects } from "../hooks/useSoundEffects";
import { formatToken } from "../lib/format";

export function HomePage() {
  const access = useDappAccess();
  const sound = useSoundEffects();

  const flapBalance = useReadContract({
    address: contracts.flapToken,
    chainId: bscChain.id,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [access.activeAddress!],
    query: {
      enabled: Boolean(contracts.flapToken && access.activeAddress),
    },
  });

  const nftBalance = useReadContract({
    address: contracts.dividendBankNft,
    chainId: bscChain.id,
    abi: erc721EnumerableAbi,
    functionName: "balanceOf",
    args: [access.activeAddress!],
    query: {
      enabled: Boolean(contracts.dividendBankNft && access.activeAddress),
    },
  });

  return (
    <div className="vault-page-stack">
      <SectionCard title="資產" description={access.isConnected ? undefined : "連接後查看。"}>
        <div className="wallet-balance-card">
          <div className="balance-stat-list">
            <div>
              <span>分紅銀行</span>
              <strong>{access.activeAddress ? formatToken(flapBalance.data) : "--"} 代幣</strong>
            </div>
            <div>
              <span>NFT 持有</span>
              <strong>{access.activeAddress ? nftBalance.data?.toString() || "0" : "--"}</strong>
            </div>
          </div>
          {!access.isConnected ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                sound.play("coin");
                void access.requestConnect();
              }}
            >
              立即連接錢包查看
            </button>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
