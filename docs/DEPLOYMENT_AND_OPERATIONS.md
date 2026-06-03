# 分红银行 GameFi 部署与运营文档

## 前置检查

- 每次主网上线或变更前，都要先复核线上 FLAP 代币行为。
- `mainPool` 交易税和 `TaxProcessor` 分账是两套独立概念，不要混为一谈。
- 普通 FLAP 转账会触发 `IDividend.setShare`。
- `Vault` 和 `IncomePool` 需要主动领取已有的 WBNB 分红。
- WBNB 回购会经过 `mainPool`，因此会受当前主池交易税规则影响。
- 部署钱包只作为临时部署、验证、铸造执行钱包使用。
- 验证完成后，要把最终权限交给运营方/发行方地址或多签地址。

## 环境配置

1. 将 `/Users/chih/Documents/NFT/分红银行/.env.example` 复制为 `.env`。
2. 填写部署私钥、线上代币地址、NFT 元数据、运营方/发行方地址等配置。
3. 将 `/Users/chih/Documents/NFT/分红银行/web/.env.example` 复制为 `web/.env`。
4. 主网部署前，先准备好以下外部依赖和参数：
   - BSC 主网 RPC。
   - Chainlink VRF 使用的 `VRF_COORDINATOR`、`VRF_KEY_HASH`、`VRF_SUBSCRIPTION_ID`。
   - 已充值的 VRF subscription，确保可以支付至少数笔游戏请求。
   - 钱包连接所需的 `VITE_WALLETCONNECT_PROJECT_ID`。
5. 如果前端要展示 Element 购买入口，提前准备 `VITE_ELEMENT_NFT_URL`，等 Element 合集页可访问后回填到 `web/.env`。

## 测试网演练顺序

1. 部署 mock FLAP 兼容环境，或使用 fork 环境。
2. 执行 `forge test --offline`。
3. 执行 `forge script script/DeployGameFi.s.sol:DeployGameFi --rpc-url <RPC> --broadcast`。
4. 执行 `forge script script/ConfigureVrf.s.sol:ConfigureVrf --rpc-url <RPC> --broadcast`。
5. 在 VRF 订阅中将 `GameManager` 添加为 consumer。
6. 铸造测试 FLAP，授权 `BankrollVault`，下注并验证完整的 `placeBet -> fulfill -> settle` 流程。
7. 铸造测试 NFT，执行 `RunDailySnapshot`，并验证 NFT 持有人可延迟领取收益。
8. 执行 `HarvestAndBuyback`，确认 `WBNB -> FLAP` 直连回购路径可用，并确认交易税只按线上交易对规则触发。

## 主网部署顺序

1. 在 `.env` 中填写主网地址和运营权限地址。
2. 如果运营方和发行方是同一个钱包，将同一个地址填入 `MULTISIG_ADMIN`、`NFT_ROYALTY_RECEIVER`、`OPERATOR_WALLET`、`PAUSER_WALLET`、`REVENUE_OPERATOR_WALLET`、`AUTOMATION_WALLET`、`NFT_MINTER_WALLET`、`NFT_METADATA_WALLET`。
3. 部署、NFT 铸造、Element 上架检查、最终交权全部完成前，部署钱包保留为临时执行钱包。
4. 在 Chainlink VRF 管理界面先创建或确认主网 subscription，并记录 `.env` 需要的以下参数：
   - `VRF_COORDINATOR`
   - `VRF_KEY_HASH`
   - `VRF_SUBSCRIPTION_ID`
   - `VRF_REQUEST_CONFIRMATIONS`
   - `VRF_CALLBACK_GAS_LIMIT`
5. 确认部署钱包已经持有足够的 BNB 用于：
   - 合约部署
   - VRF 配置
   - NFT 铸造
   - 日常运维脚本首轮演练
6. 确认运营方/发行方钱包已经准备好首轮要注入 `BankrollVault` 的 FLAP，以及首轮要上架到 Element 的 NFT 持仓。
7. 部署合约：

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/DeployGameFi.s.sol:DeployGameFi --rpc-url $BSC_RPC_URL --broadcast
```

8. 保存生成的部署清单：`/Users/chih/Documents/NFT/分红银行/deployments/<chainId>.json`。
9. 将部署清单中的地址立刻回填到 `.env`，至少补齐：
   - `SYSTEM_ACCESS_CONTROL = systemAccessControl`
   - `GAME_MANAGER = gameManager`
   - `BANKROLL_VAULT = bankrollVault`
   - `INCOME_POOL = incomePool`
   - `DIVIDEND_BANK_NFT = dividendBankNftProxy`
   - `NFT_REVENUE_DISTRIBUTOR = nftRevenueDistributor`
10. 同时将部署清单中的地址回填到 `web/.env`：
    - `VITE_SYSTEM_ACCESS_CONTROL_ADDRESS = systemAccessControl`
    - `VITE_REFERRAL_REGISTRY_ADDRESS = referralRegistry`
    - `VITE_GAME_REGISTRY_ADDRESS = gameRegistry`
    - `VITE_GAME_MANAGER_ADDRESS = gameManager`
    - `VITE_BANKROLL_VAULT_ADDRESS = bankrollVault`
    - `VITE_INCOME_POOL_ADDRESS = incomePool`
    - `VITE_DIVIDEND_BANK_NFT_ADDRESS = dividendBankNftProxy`
    - `VITE_NFT_REVENUE_DISTRIBUTOR_ADDRESS = nftRevenueDistributor`
11. 配置 Chainlink VRF：

```bash
forge script script/ConfigureVrf.s.sol:ConfigureVrf --rpc-url $BSC_RPC_URL --broadcast
```

12. 在 VRF 订阅 UI 或管理流程中，将已部署的 `GameManager` 添加为 consumer。
13. 使用运营方/发行方钱包，直接向 `BankrollVault` 地址转入首轮 FLAP 作为初始资金池流动性。
14. 校验 `BankrollVault.availableBalance()` 已经反映出可用资金，再进入下注演练。
15. 在最终交权前，将 NFT 铸造给运营方/发行方钱包：

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/MintDividendBankNft.s.sol:MintDividendBankNft --rpc-url $BSC_RPC_URL --broadcast
```

16. 将 `NFT_MINT_RECIPIENT` 设置为运营方/发行方钱包。
17. 完整合集铸造时，将 `NFT_MINT_TOTAL_QUANTITY=420`。
18. 将 `NFT_MINT_CHUNK_SIZE` 设置为安全的单笔铸造数量，例如 `20`，避免单笔 gas 过高失败。
19. 如果合集需要分发给多个地址，按每个接收地址分别设置 `NFT_MINT_RECIPIENT` 和数量，多次执行铸造脚本。
20. 完成 Element 合集页创建或识别后，将 `VITE_ELEMENT_NFT_URL` 回填到 `web/.env`。
21. 构建前端：

```bash
cd /Users/chih/Documents/NFT/分红银行/web
npm run build
```

22. 将 `web/dist` 发布到实际静态站点或 CDN，并确认域名环境加载的是最新 `web/.env` 配置。
23. 开放给用户前，用受限资金池和小额下注在主网上完整验证一次端到端流程。

## 部署后回填速查

部署脚本生成的 `/Users/chih/Documents/NFT/分红银行/deployments/<chainId>.json` 包含以下关键字段：

- `systemAccessControl`
- `referralRegistry`
- `gameRegistry`
- `incomePool`
- `bankrollVault`
- `gameManager`
- `coinFlipModule`
- `mysteryBoxModule`
- `dividendBankNftImplementation`
- `dividendBankNftProxy`
- `nftRevenueDistributor`

其中：

- `.env` 中的 `DIVIDEND_BANK_NFT` 应填写 `dividendBankNftProxy`，不是 implementation 地址。
- `web/.env` 中的 `VITE_DIVIDEND_BANK_NFT_ADDRESS` 也应填写 `dividendBankNftProxy`。
- 如果后续需要浏览器验证实现合约，NFT 应同时记录 implementation 和 proxy 两个地址。

## Element 合集与版税设置

1. 在 Element 中使用 `DIVIDEND_BANK_NFT` 作为合集合约地址。
2. 确认 Element 正确展示合集名称、symbol、元数据、总量和持有人余额。
3. 将 Element 合集 royalty receiver 设置为 `NFT_ROYALTY_RECEIVER` 对应的运营方/发行方钱包。
4. 将 Element royalty 百分比设置为和 `NFT_ROYALTY_BPS` 一致，例如 `500` bps 表示 `5%`。
5. 首发销售采用“运营方/发行方钱包持有 NFT 后在 Element 挂单”的方式，因此首发销售款会直接进入运营方/发行方钱包。
6. 二级转售版税由 Element 市场执行。NFT 合约已经暴露 ERC2981 版税信息，但钱包直接转账、或不执行版税的市场，不会强制支付二级版税。
7. Element 合集页可访问后，将其 URL 回填到 `web/.env` 的 `VITE_ELEMENT_NFT_URL`，让前端显示购买入口。
8. 除非运营方/发行方钱包已经拥有 `MINTER_ROLE`，否则要先完成 NFT 铸造和 Element 合集检查，再执行 `FinalizeMultisigHandover`。

## NFT 铸造、分发与流转自测

### 1. 铸造前检查

1. 确认 `.env` 中 `DIVIDEND_BANK_NFT` 已填写 proxy 地址。
2. 确认执行钱包仍然拥有 `MINTER_ROLE`。
3. 确认 `NFT_BASE_URI` 已经指向最终可访问的元数据前缀，或确认后续仍可由 `METADATA_ROLE` 调整。
4. 确认 `NFT_ROYALTY_RECEIVER` 和 `NFT_ROYALTY_BPS` 已经按最终主网方案设置。

### 2. 铸造执行

1. 先用小批量验证，例如：
   - `NFT_MINT_RECIPIENT = 运营方钱包`
   - `NFT_MINT_TOTAL_QUANTITY = 5`
   - `NFT_MINT_CHUNK_SIZE = 5`
2. 执行铸造脚本并确认交易成功。
3. 在链上检查：
   - `totalSupply()` 是否按预期增加。
   - `balanceOf(运营方钱包)` 是否按预期增加。
   - `tokenOfOwnerByIndex()` 是否能枚举出刚铸造的 token id。
4. 小批量验证通过后，再执行整批铸造。

### 3. 铸造后分发

1. 如果首发由运营方统一持仓后上架，则先不要分散转出全部 NFT。
2. 如果需要分发给多个地址：
   - 先列出分发名单、数量、目标地址。
   - 先做 1 到 2 笔小额转账验证。
   - 再批量执行剩余分发。
3. 每轮分发后抽查：
   - 接收地址 `balanceOf()`。
   - NFT 页面显示的持仓编号。
   - `getPastBalanceOf()` 在新块高下是否能反映最新持仓。

### 4. NFT 转账与交易自测

1. 选两只测试钱包：
   - 钱包 A：持有已铸造 NFT。
   - 钱包 B：空白钱包，用于接收和购买。
2. 从钱包 A 向钱包 B 做一次直接链上转账。
3. 验证：
   - 两个钱包的 `balanceOf()` 变化正确。
   - 前端 NFT 页面持仓展示正确。
   - 后续快照前后的 `getPastBalanceOf()` 结果符合预期。
4. 如果要验证首发销售或二级销售，优先使用小编号、小金额 NFT 做一次完整闭环。

## dApp 发布、验证与回滚

### 1. 发布前检查

1. 确认 `web/.env` 已填入：
   - `VITE_WALLETCONNECT_PROJECT_ID`
   - `VITE_BSC_RPC_URL`
   - `VITE_FLAP_TOKEN_ADDRESS`
   - `VITE_FLAP_DIVIDEND_ADDRESS`
   - 所有 `VITE_*_ADDRESS`
   - `VITE_ELEMENT_NFT_URL`（如果 Element 已开放）
2. 执行：

```bash
cd /Users/chih/Documents/NFT/分红银行/web
npm run build
```

3. 确认构建产物位于 `web/dist`。

### 2. 发布后烟雾测试

发布完成后，至少人工验证以下页面：

1. 首页：基础文案、合约地址、钱包连接按钮正常。
2. 游戏页：可读取游戏配置、可发起下注。
3. NFT 页：可展示 NFT 合约地址、总铸造量、个人持仓、Element 入口。
4. 收益页：可读取当前 day id、历史未领取分红、批量补领按钮状态。
5. 邀请页：可生成推荐链接、复制链接。
6. 管理页：有权限的钱包能看到角色状态、暂停/恢复、快照、退款入口。

### 3. 主网前端交易验证

1. 用普通用户钱包验证：
   - 连接钱包
   - 切换到 BSC 主网
   - 读取余额
   - 授权 FLAP 给 `BankrollVault`
   - 发起一笔最小下注
2. 用 NFT 持有人钱包验证：
   - NFT 页面读取持仓
   - 收益页预览当日或历史可领取收益
   - 领取一次收益
3. 用管理钱包验证：
   - 管理页角色显示
   - 快照按钮状态
   - 暂停/恢复按钮状态

### 4. 回滚准备

1. 每次正式发布前，保留上一版 `web/dist` 备份。
2. 记录每次发布对应的：
   - git 提交版本
   - `web/.env` 配置版本
   - 发布地址或 CDN 版本号
3. 如果新前端出现异常：
   - 先确认是否只是环境变量配置错误。
   - 如果是前端版本问题，优先回滚到上一版静态资源。
   - 如果问题影响下注、领取或管理操作，必要时先由 `PAUSER_ROLE` 钱包暂停系统。

## 上线验收清单

### 1. 合约部署验收

- `deployments/<chainId>.json` 已生成并存档。
- `.env` 已回填部署地址。
- `web/.env` 已回填部署地址。
- `GameRegistry` 已注册 `coin-flip`、`mystery-box`。
- `mystery-box` 默认禁用状态符合预期。
- `IncomePool.nftDistributor` 已正确指向 `NftRevenueDistributor`。
- `GameManager` 已完成 VRF 配置。
- VRF subscription 已添加 `GameManager` 为 consumer。
- 部署钱包和运营钱包角色分配符合预期。

### 2. 资金与游戏验收

- `BankrollVault` 已收到首轮 FLAP 流动性。
- 普通用户钱包已完成 `approve(BankrollVault)`。
- 最小下注可成功进入 `Pending`。
- VRF 回调后注单可成功结算。
- 输局时 burn、income、referral 分账符合预期。
- 赢局时 payout、burn、income、referral 分账符合预期。
- 如 VRF 延迟，可由运营钱包成功执行 `refundPendingBet`。

### 3. NFT 与 Element 验收

- 小批量铸造成功。
- 全量铸造成功，`totalSupply()` 与预期一致。
- 直接链上转账测试成功。
- NFT 元数据在钱包和 Element 中展示正常。
- Element 合集页正确识别名称、symbol、总量、持仓。
- Element royalty receiver 与 bps 显示正确。
- 至少完成一次小额挂单验证。
- 至少完成一次小额购买验证。
- 如计划支持二级流转，至少完成一次二级转售和版税抽查。

### 4. 收益与运维验收

- 当日快照可成功执行。
- `snapshotAndPull()` 后快照记录正确。
- NFT 持有人可正常 `claim()`。
- `claimBatch()` 可补领历史收益。
- `HarvestAndBuyback` 可成功领取 WBNB 分红并回购 FLAP。
- `BUYBACK_MIN_FLAP_OUT` 使用的是广播前最新报价。
- 管理页能展示系统角色、暂停状态和快照状态。

### 5. 交权验收

- 合约已完成浏览器验证。
- `MULTISIG_ADMIN` 已拥有最终权限。
- 部署钱包已完成权限 renounce。
- 运营手册、部署清单、环境变量备份已归档。

## 运营执行手册

### 1. 日常角色分工

- `DEFAULT_ADMIN_ROLE`：最终管理员，多签或最终控制钱包。
- `OPERATOR_ROLE`：VRF 配置、退款处理、游戏参数运维。
- `PAUSER_ROLE`：紧急暂停。
- `REVENUE_ROLE`：收益回收、回购、快照参数调整。
- `AUTOMATION_ROLE`：每日 NFT 快照执行。
- `MINTER_ROLE`：NFT 铸造。
- `METADATA_ROLE`：NFT 元数据更新。

### 2. 日常操作频率

- 每日 UTC+8 00:00 后 10 分钟内：执行 NFT 快照。
- 每日或按运营频率：执行 WBNB 分红领取与 FLAP 回购。
- 每次前端发布后：做一次前端烟雾测试。
- 每次 VRF 参数调整后：做一笔最小下注验证。

### 3. 当前前端管理页已覆盖的操作

前端 `/admin` 页面当前可直接执行：

- 查看当前地址角色状态。
- `pause()` / `unpause()`。
- 执行当日 `snapshotAndPull()`。
- 按注单编号执行 `refundPendingBet()`。

其他运维操作目前仍需通过脚本、区块浏览器写合约或定制后台完成。

### 4. 需要保留的运营台账

- 部署清单 `deployments/<chainId>.json`
- 当前生效的 `.env`
- 当前生效的 `web/.env`
- VRF subscription 信息
- 首轮 NFT 铸造与分发记录
- Element 挂单和成交记录
- 每日快照执行记录
- 每日回购执行记录
- 异常处理记录

## 异常处理手册

### 1. VRF 长时间未回调

1. 先确认 Chainlink subscription 余额是否充足。
2. 确认 `GameManager` 仍在 consumer 列表中。
3. 确认 `VRF_COORDINATOR`、`VRF_KEY_HASH`、`VRF_SUBSCRIPTION_ID` 未被误改。
4. 如果注单长时间保持 `Pending`，由 `OPERATOR_ROLE` 钱包执行 `refundPendingBet(betId)`。
5. 如果存在连续异常，暂停新下注并排查后再恢复。

### 2. 错过当日 NFT 快照窗口

1. 如果仍处于同一 UTC+8 日内且尚未生成快照，可由 `REVENUE_ROLE` 钱包适度上调 `snapshotWindowSeconds`，再由 `AUTOMATION_ROLE` 执行快照。
2. 如果已经跨到下一 UTC+8 日，当前合约无法为前一日补建快照。
3. 这种情况下要立刻记录事故，并由运营方决定是否采用人工补偿方案。
4. 如问题来自自动化执行失败，需要在恢复后补做监控与告警。

### 3. 回购失败或滑点异常

1. 检查 `IncomePool` 中 WBNB 余额是否正确。
2. 检查 `BUYBACK_MIN_FLAP_OUT` 是否基于最新报价设置。
3. 检查路由路径是否仍为 `[WBNB, FLAP]`。
4. 检查 Pancake 路由地址是否仍有效。
5. 如短时流动性异常，暂停回购，等待报价恢复后再执行。

### 4. 前端异常

1. 先区分是链上异常还是前端异常：
   - 合约读写都失败，优先检查 RPC、配置地址、钱包网络。
   - 链上正常但页面展示异常，优先检查前端版本和 `web/.env`。
2. 如果只是展示异常但资金安全不受影响，可先回滚前端。
3. 如果异常会影响下注、领取、管理，必要时暂停系统并发布公告。

### 5. NFT 元数据或 Element 展示异常

1. 检查 `NFT_BASE_URI` 对应资源是否可访问。
2. 如元数据路径错误，可由 `METADATA_ROLE` 调整 base URI。
3. 确认 Element 是否已重新抓取或刷新合集缓存。
4. 在恢复正常前，不建议继续扩大挂单或大规模分发。

## 每日自动化任务

### 1. UTC+8 00:00 NFT 快照

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/RunDailySnapshot.s.sol:RunDailySnapshot --rpc-url $BSC_RPC_URL --broadcast
```

- 脚本会通过 `currentUtc8DayId()` 自动获取当天 day id。
- 合约设计中，快照区块固定为 `block.number - 1`。
- `snapshotAndPull()` 只接受当前 UTC+8 日期的 day id。
- 默认快照窗口为 UTC+8 00:00 后的前 10 分钟。
- 如果运营需要调整快照窗口，需要由拥有 `REVENUE_ROLE` 的钱包提前更新 `snapshotWindowSeconds`。

### 2. 领取 WBNB 分红并回购 FLAP

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/HarvestAndBuyback.s.sol:HarvestAndBuyback --rpc-url $BSC_RPC_URL --broadcast
```

- 该脚本会领取 `BankrollVault` 已产生的 WBNB 分红。
- 该脚本会将 `BankrollVault` 中的 WBNB 转入 `IncomePool`。
- 该脚本会领取 `IncomePool` 已产生的 WBNB 分红。
- 该脚本会通过 `[WBNB, FLAP]` 路径将 `IncomePool` 中的 WBNB 换成 FLAP。
- 每次广播前，都要用最新报价设置 `BUYBACK_MIN_FLAP_OUT`。

## 最终权限交接

1. 确认部署、角色、游戏注册、VRF 配置都已经在链上验证完成。
2. 确认 NFT 铸造和 Element 合集设置已经完成。
3. 确认 `AUTOMATION_WALLET`、`REVENUE_OPERATOR_WALLET`、`OPERATOR_WALLET` 等最终运营地址已经在部署阶段获得预期角色，且不再依赖部署钱包长期运维。
4. 在 `.env` 中设置 `SYSTEM_ACCESS_CONTROL`、`DIVIDEND_BANK_NFT`、`MULTISIG_ADMIN`。
5. 执行交接脚本：

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/FinalizeMultisigHandover.s.sol:FinalizeMultisigHandover --rpc-url $BSC_RPC_URL --broadcast
```

6. 确认部署钱包已经不再拥有 admin、pauser、revenue、NFT admin 等权限。
7. 确认运营方/发行方钱包已经拥有预期的系统 admin、revenue、operator、automation、NFT admin、NFT minter、NFT metadata 权限。

## 合约验证

主网部署完成后，至少要完成以下合约的区块浏览器验证：

- `SystemAccessControl`
- `ReferralRegistry`
- `GameRegistry`
- `IncomePool`
- `BankrollVault`
- `GameManager`
- `CoinFlipModule`
- `MysteryBoxModule`
- `DividendBankNFT` implementation
- `ERC1967Proxy` 对应的 `DividendBankNFT` proxy
- `NftRevenueDistributor`

建议在最终交权前完成验证，并保留：

- 部署交易哈希
- 验证结果页面
- `deployments/<chainId>.json`
- 最终生效的 `.env` 和 `web/.env` 备份

## 权限说明

- `GameManager` 必须拥有 `GAME_MANAGER_ROLE`、`REFERRAL_BINDER_ROLE`、`REFERRAL_REWARD_ROLE`。
- `NftRevenueDistributor` 必须拥有 `REVENUE_ROLE`，因为 `snapshotAndPull()` 内部会调用 `IncomePool.allocateToNftDistributor()`。
- 自动化执行钱包必须拥有 `AUTOMATION_ROLE`。
- 收入运营钱包必须拥有 `REVENUE_ROLE`。

## 监控清单

- VRF 订阅余额和 callback 失败情况。
- UTC+8 00:00 后是否缺失每日 NFT 快照。
- WBNB 分红领取是否失败。
- 回购是否失败，或滑点是否超过预期。
- 系统 pause 状态是否异常变化。
- `BankrollVault` 是否出现异常大额赔付。
- 邀请奖励是否偏离预期的 `0.2%`。

## Fork 验证清单

- 使用真实 FLAP 代币地址。
- 使用真实 Dividend 合约地址。
- 测试 `Vault` 和 `IncomePool` 的 `claimExistingFlapDividends()`。
- 测试真实交易对上的 `WBNB -> FLAP` 直连回购。
- 确认回购路径只按线上 `mainPool` 税务行为触发。
