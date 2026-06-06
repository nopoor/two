import { useReadContract } from "wagmi";
import { SectionCard } from "../components/SectionCard";
import { erc20Abi, erc721EnumerableAbi } from "../abi/common";
import { contracts } from "../config/contracts";
import { bscChain } from "../config/chains";
import { useDappAccess } from "../hooks/useDappAccess";
import { useSoundEffects } from "../hooks/useSoundEffects";
import { useI18n } from "../i18n/LanguageProvider";
import { formatToken } from "../lib/format";

export function HomePage() {
  const access = useDappAccess();
  const sound = useSoundEffects();
  const { t } = useI18n();

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
      <SectionCard title={t("home.assetTitle")} description={access.isConnected ? undefined : t("common.connectToView")}>
        <div className="wallet-balance-card">
          <div className="balance-stat-list">
            <div>
              <span>{t("home.assetToken")}</span>
              <strong>{access.activeAddress ? formatToken(flapBalance.data) : "--"} {t("common.tokenName")}</strong>
            </div>
            <div>
              <span>{t("home.assetNftHoldings")}</span>
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
              {t("home.connectToViewCta")}
            </button>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
