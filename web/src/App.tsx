import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { HomePage } from "./pages/HomePage";
import { PlayPage } from "./pages/PlayPage";
import { SpacePredictionPage } from "./pages/SpacePredictionPage";
import { NftPage } from "./pages/NftPage";
import { RevenuePage } from "./pages/RevenuePage";
import { ReferralPage } from "./pages/ReferralPage";
import { useI18n } from "./i18n/LanguageProvider";

const AdminPage = lazy(() => import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })));

export function App() {
  const { t } = useI18n();

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/play" element={<PlayPage />} />
        <Route path="/play/space" element={<SpacePredictionPage />} />
        <Route path="/nft" element={<NftPage />} />
        <Route path="/revenue" element={<RevenuePage />} />
        <Route path="/referrals" element={<ReferralPage />} />
        <Route
          path="/admin"
          element={(
            <Suspense fallback={<div className="section-card compact">{t("app.loading")}</div>}>
              <AdminPage />
            </Suspense>
          )}
        />
      </Route>
    </Routes>
  );
}
