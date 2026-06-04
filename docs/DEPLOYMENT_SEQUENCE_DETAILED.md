# 分红银行 GameFi 详细部署顺序说明

## 本次主网已确认配置

- NFT 名称：`分红银行`
- NFT 简称：`分红银行`
- NFT 版税：`400` bps，即 `4%`
- 当前执行口径：使用你的钱包代部署整套合约
- 代部署钱包定位：仅负责部署、验证、铸造和交权前临时执行
- 最终结果要求：交权完成后，该代部署钱包不再保留任何系统权限或 NFT 管理权限
- 主钱包：`0xEa9eDE1d6Fb9aDe1398Fe2423AeaAA64d7364d01`
- 主钱包用途：`owner` + NFT 版税接收
- 运营自动化钱包：`0x487aA7Fc6643A20Ea816DEA562FBc53D4AB0cA8b`
- 运营自动化钱包用途：仅用于日常自动化脚本
- 正式 dApp 域名：`https://www.dividendbank.com`

## 执行前提醒

- 所有 `forge script` 示例在执行前，都应先把 `.env` 导出到当前 shell 环境。
- 推荐统一使用：

```bash
set -a
source .env
set +a
```

- 老板已单独提供运营自动化钱包私钥，但出于安全原因，不在仓库文档中记录明文私钥。
- 如需由自动化钱包执行日常广播脚本，请在本地 `.env` 手工填写 `DEPLOYER_PRIVATE_KEY`，并确保 `.env` 不入库。
- 当前执行原则是“你的钱包代部署，主钱包接最终权限”，因此部署钱包只在交权前临时持权。

## 这份文档解决什么问题

这份文档专门回答两个问题：

1. 主网正式上线时，建议按什么顺序部署、配置、验证、发行和开放。
2. 是否可以先发行 NFT，再部署其他部分。

这里的“发行 NFT”需要拆开理解：

- `部署 NFT 合约`：把 `DividendBankNFT` 合约和 proxy 部署到链上。
- `铸造 NFT`：调用 `mint()` 真正把 NFT 发到持有人钱包。
- `开放 NFT 交易`：把 NFT 挂到 Element，允许用户买卖。

这三件事不是一回事，顺序也不一样。

## 先说结论

### 推荐顺序

推荐顺序是：

1. 先准备外部依赖和环境变量
2. 一次性部署整套核心合约
3. 回填地址到 `.env` 和 `web/.env`
4. 配置 VRF
5. 给 `BankrollVault` 注入首轮 FLAP
6. 小批量铸造 NFT
7. 检查 NFT 元数据、持仓、转账
8. Element 合集识别和首轮挂单验证
9. 构建并发布 dApp
10. 用小资金做主网端到端彩排
11. 全量铸造或补铸
12. 最终权限交接

### 能不能先发行 NFT

如果你的意思是：

- `先铸造 NFT，再部署游戏/收益/权限其他部分`

按当前仓库的脚本和结构，不推荐，也基本不应该这么做。

原因是当前仓库的 NFT 不是一个完全孤立的单体项目。现有部署脚本会把下面这些内容作为一整套部署：

- `SystemAccessControl`
- `ReferralRegistry`
- `GameRegistry`
- `IncomePool`
- `BankrollVault`
- `GameManager`
- 游戏模块
- `DividendBankNFT`
- `NftRevenueDistributor`

也就是说，当前代码默认的部署模型是“整套一起部署”，不是“先单独发一个 NFT 项目，再晚点接别的合约”。

### 更精确一点的结论

1. `不能在当前默认流程里，先铸造 NFT 再去部署整套核心合约`
   - 因为你连 `DIVIDEND_BANK_NFT` 地址都还没有。
   - 当前 `MintDividendBankNft.s.sol` 依赖已经存在的 `DIVIDEND_BANK_NFT` 地址。

2. `可以在整套核心合约部署完成后，先铸造 NFT，再慢一点上线游戏或前端`
   - 这是可行的。
   - 也是当前代码结构下更合理的“先 NFT、后业务开放”的做法。

3. `理论上可以专门改脚本，先单独部署 NFT，再后补其他模块`
   - 但当前仓库没有现成脚本支持这种顺序。
   - 这会引入额外的接线和交付风险。
   - 如果现在目标是稳定上线，不建议这么改。

## 当前代码里的真实依赖关系

### 1. NFT 部署不是完全独立的

当前 `DeployGameFi.s.sol` 里，NFT stack 的部署发生在整套合约部署过程中，而不是一个单独脚本：

- 先部署 `SystemAccessControl`
- 再部署 `ReferralRegistry`
- 再部署 `GameRegistry`
- 再部署 `IncomePool`
- 再部署 `BankrollVault`
- 再部署 `GameManager`
- 再部署游戏模块
- 最后部署 `DividendBankNFT` + `NftRevenueDistributor`

其中 `NftRevenueDistributor` 构造时依赖：

- `accessControl`
- `flapToken`
- `nft`
- `incomePool`

所以当前实现里，NFT 收益模块天然绑定在整套系统里，不是完全孤立的 NFT 合集。

### 2. 铸造脚本依赖已部署 NFT

`MintDividendBankNft.s.sol` 运行前必须已经有：

- `DIVIDEND_BANK_NFT`
- `NFT_MINT_RECIPIENT`
- `NFT_MINT_TOTAL_QUANTITY`
- `NFT_MINT_CHUNK_SIZE`

也就是说，先有 NFT 合约地址，才能铸造。

### 3. NFT 分红功能依赖收益池

NFT 分红不是“铸了就自动有收益”，而是依赖：

- `IncomePool` 里先有 FLAP
- `NftRevenueDistributor` 已部署
- `IncomePool.nftDistributor` 已经设置
- 每日 `snapshotAndPull()` 正常执行

所以如果你很早就把 NFT 发出去了，但收益池和快照机制还没准备好，NFT 也不会开始正常分红。

## 推荐的详细部署顺序

下面是更稳的主网顺序。

## 第一阶段：部署前准备

### 1. 确认主网参数

先准备并确认：

- `BSC_RPC_URL`
- `FLAP_TOKEN`
- `FLAP_DIVIDEND`
- `WBNB_TOKEN`
- `PANCAKE_ROUTER_V2`
- `VRF_COORDINATOR`
- `VRF_KEY_HASH`
- `VRF_SUBSCRIPTION_ID`
- `VRF_REQUEST_CONFIRMATIONS`
- `VRF_CALLBACK_GAS_LIMIT`

### 2. 确认角色钱包

至少确认这些地址：

- `MULTISIG_ADMIN`
- `OPERATOR_WALLET`
- `PAUSER_WALLET`
- `REVENUE_OPERATOR_WALLET`
- `AUTOMATION_WALLET`
- `NFT_MINTER_WALLET`
- `NFT_METADATA_WALLET`
- `NFT_ROYALTY_RECEIVER`

如果你们这次按“1 个 owner 钱包 + 1 个运营钱包”执行，可以这样理解：

- `MULTISIG_ADMIN`
  - 填 owner 钱包
  - 这是最终最高权限地址，也适合同时作为 NFT 版税接收钱包
  - 本次主网确认地址：`0xEa9eDE1d6Fb9aDe1398Fe2423AeaAA64d7364d01`
- `NFT_ROYALTY_RECEIVER`
  - 直接填 owner 钱包
  - 本次主网确认地址：`0xEa9eDE1d6Fb9aDe1398Fe2423AeaAA64d7364d01`
- `OPERATOR_WALLET`
  - 填运营钱包
  - 负责退款等日常运营动作
  - 如果本次未单独确认该角色地址，先不要在文档中假定与自动化钱包相同
- `REVENUE_OPERATOR_WALLET`
  - 也可以直接填同一个运营钱包
  - 负责收益处理和回购
- `AUTOMATION_WALLET`
  - 也可以直接填同一个运营钱包
  - 负责每日 NFT 快照自动化
  - 本次主网确认地址：`0x487aA7Fc6643A20Ea816DEA562FBc53D4AB0cA8b`

### 3. 确认 NFT 基础信息

确认：

- `NFT_NAME`
- `NFT_SYMBOL`
- `NFT_BASE_URI`
- `NFT_ROYALTY_BPS`
- 本次主网建议直接固定为：
  - `NFT_NAME=分红银行`
  - `NFT_SYMBOL=分红银行`
  - `NFT_ROYALTY_RECEIVER=0xEa9eDE1d6Fb9aDe1398Fe2423AeaAA64d7364d01`
  - `NFT_ROYALTY_BPS=400`

这里还要额外确认一件非常实际的事：

- `NFT_BASE_URI` 对应的元数据托管已经可以被公网正常访问

推荐直接使用：

- `NFT_BASE_URI=https://assets.dividendbank.com/nft/`

### 3.1 NFT 元数据托管到底要准备什么

不是只创建一个文件夹就结束，而是要同时准备：

1. 资产域名
   - 例如 `assets.dividendbank.com`
2. 服务器站点配置
   - 让该域名真正返回 JSON 和图片
3. 元数据文件
   - 至少覆盖要先 mint 的 token id
4. 图片文件
   - 与元数据里的 `image` 字段一致
5. HTTPS
   - 钱包和市场读取更稳定
6. 批量生成脚本
   - 当前仓库已提供 `node tools/generate-nft-metadata.mjs`

### 3.2 当前合约对元数据路径的真实要求

当前合约会直接返回：

- `NFT_BASE_URI + tokenId`

不是：

- `NFT_BASE_URI + tokenId + ".json"`

所以如果你填写：

```env
NFT_BASE_URI=https://assets.dividendbank.com/nft/
```

那么实际必须能访问：

- `https://assets.dividendbank.com/nft/1`
- `https://assets.dividendbank.com/nft/2`
- ...

### 3.3 推荐的服务器和目录结构

如果 `assets.dividendbank.com` 和 `www.dividendbank.com` 共用同一台服务器，完全可以。

推荐目录：

```text
/var/www/dividendbank/web/dist/
/var/www/dividendbank/assets/nft/
/var/www/dividendbank/assets/images/
```

推荐文件：

```text
/var/www/dividendbank/assets/nft/1
/var/www/dividendbank/assets/nft/2
/var/www/dividendbank/assets/images/001.PNG
/var/www/dividendbank/assets/images/002.PNG
```

### 3.3.1 你现在这批 `001.PNG` 到 `420.PNG` 图片怎么接

当前仓库已提供批量生成脚本：

```bash
cd /Users/chih/Documents/NFT/分红银行
node tools/generate-nft-metadata.mjs
```

默认会生成：

```text
metadata/generated/1
metadata/generated/2
...
metadata/generated/420
```

并自动按以下规则引用图片：

- `tokenId 1 -> 001.PNG`
- `tokenId 2 -> 002.PNG`
- `tokenId 3 -> 003.PNG`
- ...
- `tokenId 420 -> 420.PNG`

也就是说，你不用手写 420 份 JSON。

### 3.4 为什么这一步应该放在 mint 前面

因为如果先 mint，再慢慢补元数据：

- 钱包里可能先显示为空白
- Element 识别合集时可能先抓到不完整数据
- 后面虽然能修，但会增加首发阶段的沟通成本

所以更稳的顺序是：

1. 先把元数据域名和文件准备好
   - 包括先跑一遍元数据生成脚本
2. 再部署
3. 再小批量 mint
4. 再上 Element

### 4. 确认资金准备

上线前至少准备：

- 部署钱包的 BNB
- VRF subscription 资金
- 首轮注入 `BankrollVault` 的 FLAP
- 运营钱包保留的测试 FLAP
- 挂到 Element 的首轮 NFT

## 第二阶段：一次性部署核心合约

### 1. 执行整套部署

执行：

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/DeployGameFi.s.sol:DeployGameFi --rpc-url $BSC_RPC_URL --broadcast
```

### 2. 为什么这里推荐整套一起部署

原因有三个：

1. 这是当前仓库原生支持的路径。
2. 部署后生成的 `deployments/<chainId>.json` 能一次性把所有关键地址记录下来。
3. 可以避免你后面再手动拼接 “旧 NFT + 新收益池 + 新权限系统” 的组合风险。

### 3. 当前默认首发游戏状态

部署脚本默认会把游戏注册完整，但首发状态会控制为：

- `coin-flip / 飞船模式`：开启
- `mystery-box / 盲盒模式`：关闭

这样主网上线时可以先只跑飞船，等观察 3 天左右真实投注和资金波动后，再由 owner 钱包在 dApp 后台手动开启盲盒。

## 第三阶段：部署后回填

部署成功后，马上做两件事。

### 1. 回填 `.env`

至少回填：

- `SYSTEM_ACCESS_CONTROL`
- `GAME_MANAGER`
- `BANKROLL_VAULT`
- `INCOME_POOL`
- `DIVIDEND_BANK_NFT`
- `NFT_REVENUE_DISTRIBUTOR`

注意：

- `DIVIDEND_BANK_NFT` 必须填 proxy 地址，不是 implementation 地址。

### 2. 回填 `web/.env`

至少回填：

- `VITE_SYSTEM_ACCESS_CONTROL_ADDRESS`
- `VITE_REFERRAL_REGISTRY_ADDRESS`
- `VITE_GAME_REGISTRY_ADDRESS`
- `VITE_GAME_MANAGER_ADDRESS`
- `VITE_BANKROLL_VAULT_ADDRESS`
- `VITE_INCOME_POOL_ADDRESS`
- `VITE_DIVIDEND_BANK_NFT_ADDRESS`
- `VITE_NFT_REVENUE_DISTRIBUTOR_ADDRESS`

## 第四阶段：配置 VRF

### 1. 先配置

执行：

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/ConfigureVrf.s.sol:ConfigureVrf --rpc-url $BSC_RPC_URL --broadcast
```

### 2. 再加 consumer

到 Chainlink VRF 管理界面，把 `GameManager` 加进 subscription consumer 列表。

### 3. 为什么 VRF 要放在 NFT 铸造前面

不是因为 NFT 依赖 VRF，而是因为：

- VRF 是游戏是否可用的关键断点。
- 越早确认 VRF 通，越早知道主网最关键的一条链路是否正常。
- 否则你可能先发了一堆 NFT、先做了前端宣传，结果游戏主流程还没通。

## 第五阶段：注入资金池

### 1. 向 `BankrollVault` 注入 FLAP

用运营钱包或资金钱包，直接给 `BankrollVault` 地址转入首轮 FLAP。

### 2. 为什么这一步要早于开放游戏

因为下注时 `BankrollVault` 会检查可用余额是否足够覆盖潜在利润。

如果这一步不做：

- 前端看起来可能都正常
- 但用户第一笔下注就可能失败

## 第六阶段：先小批量铸造 NFT

### 1. 推荐先小批量

不要一上来铸满 420。

建议先做：

- `NFT_MINT_RECIPIENT = 运营方钱包`
- `NFT_MINT_TOTAL_QUANTITY = 5`
- `NFT_MINT_CHUNK_SIZE = 5`

然后执行：

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/MintDividendBankNft.s.sol:MintDividendBankNft --rpc-url $BSC_RPC_URL --broadcast
```

### 2. 先小批量的原因

先验证这些事情：

- `mint()` 权限正常
- `totalSupply()` 正常
- `balanceOf()` 正常
- `tokenOfOwnerByIndex()` 正常
- 元数据路径正常
- 钱包显示正常
- Element 能否正确识别合集

### 3. 什么时候再全量铸造

小批量检查通过后，再决定：

- 继续整批铸满
- 或者先保留一部分，等首轮主网彩排完成再铸

## 第七阶段：NFT 自测与 Element 上架

### 1. 先做链上转账自测

至少验证一次：

- 钱包 A 持有 NFT
- 钱包 A 转给钱包 B
- 钱包 B 页面可读到 NFT

### 2. 再做 Element 识别

确认：

- 合集名称正确
- symbol 正确
- 总量正确
- royalty 显示正确
- 持仓显示正确

### 3. 再做小额挂单和购买

建议用：

- 小编号 NFT
- 小金额挂单
- 受控测试钱包购买

先做一笔完整闭环，再决定是否正式开放大量交易。

## 第八阶段：部署 dApp

### 1. 回填前端参数

包括：

- 全部合约地址
- `VITE_WALLETCONNECT_PROJECT_ID`
- `VITE_BSC_RPC_URL`
- `VITE_ELEMENT_NFT_URL`（如果 Element 页面已经可访问）
- 正式站点域名 `https://www.dividendbank.com`
- NFT 元数据资产域名 `https://assets.dividendbank.com`

### 2. 构建前端

```bash
cd /Users/chih/Documents/NFT/分红银行/web
npm run build
```

### 3. 发布前端

把 `web/dist` 发布到你们实际使用的静态站点或 CDN。

### 4. 发布后人工点测

至少检查：

- 首页
- 游戏页
- NFT 页
- 收益页
- 邀请页
- 管理页

## 第九阶段：主网小流量彩排

这里非常重要。

在正式开放前，用小资金、小流量做一次完整闭环：

1. 普通用户钱包：
   - 连接钱包
   - 授权 FLAP
   - 发起最小下注

2. 管理钱包：
   - 确认 VRF 已回调
   - 确认注单正确结算

3. NFT 持有人钱包：
   - 等到快照日
   - 执行 `snapshotAndPull()`
   - 领取一次收益

4. 收益钱包：
   - 执行一次 `HarvestAndBuyback`

5. Element：
   - 做一次挂单
   - 做一次购买

这一步通过后，再考虑完全开放。

## 第十阶段：全量开放前的最终动作

### 1. 补全 NFT 铸造

如果前面只做了小批量，这时再补足：

- 全部 420
- 或运营确定的实际首发数量

### 2. 完成前端正式发布

确保线上站点访问的是最新构建。

### 3. 完成最终角色检查

确认：

- 运营地址角色已齐
- 部署钱包仍保留临时权限
- 还没有过早 `renounce`

## 第十一阶段：最终权限交接

等下面这些都确认完成后，再交权：

- 合约部署完成
- 地址回填完成
- VRF 正常
- NFT 已确认正常
- Element 已确认正常
- dApp 已确认正常
- 主网彩排已通过

然后执行：

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/FinalizeMultisigHandover.s.sol:FinalizeMultisigHandover --rpc-url $BSC_RPC_URL --broadcast
```

交权完成后应满足：

- 主钱包成为唯一最终控制入口。
- 你的代部署钱包完成全部 `renounce`。
- 你的代部署钱包不再保留任何系统角色，也不再保留 NFT 管理权限。

## 关于“是否可以先发行 NFT”的详细判断

## 方案 A：先部署整套，再先发 NFT，再晚点开放游戏

这是当前最推荐的方案。

顺序：

1. 部署整套
2. 配 VRF
3. 小批量铸 NFT
4. 上 Element
5. 部署前端
6. 再开放游戏和收益功能

优点：

- 不需要改脚本
- 不会破坏现有依赖关系
- NFT 可以先开始市场动作
- 游戏可以后开

缺点：

- 需要在运营口径上明确告诉用户：NFT 已发，但某些收益或玩法要按上线节奏开放

## 方案 B：先单独部署 NFT 合约，再几天后部署其他合约

当前仓库不建议这样做。

原因：

1. 现成脚本不支持。
2. 你后面还要保证：
   - `NftRevenueDistributor` 使用的 NFT 地址就是这一个
   - 权限体系能正确接上
   - 前端地址不会混乱
   - 交权流程不会出现旧 admin / 新 admin 混用
3. 这会让交付路径从“标准流程”变成“定制流程”。

如果你一定要这么做，最好是单独开一个改造任务，而不是在上线前临时调整。

## 方案 C：先铸造 NFT，再部署 NFT 以外的其他合约

按当前代码，这是不可行的。

因为：

- 没有已部署的 `DIVIDEND_BANK_NFT`，就无法执行 mint 脚本。
- mint 不是离线动作，它必须对链上现有 NFT 合约发交易。

## 推荐给业务侧的实际节奏

如果你的业务目标是“先做 NFT 市场预热，再开放游戏”，最稳的执行法是：

1. 主网先部署整套合约
2. 不急着开放游戏入口
3. 先小批量铸造 NFT
4. 先上 Element
5. 先做 NFT 转账和交易自测
6. 再完成 VRF、前端、资金池和收益链路的最终彩排
7. 最后全面开放游戏和收益

这样从外部看起来像“先发 NFT”，但底层依然走的是稳定的整套部署路径。

## 最终建议

如果你现在追求的是“尽快交付而且风险最低”，建议采用下面这个原则：

- `不要先单独做 NFT 项目部署`
- `先部署整套核心合约`
- `可以在整套部署完成后，先铸造 NFT、先上 Element、后开放游戏`

这是当前仓库最稳、最符合现有脚本、也最容易交接给后续运营团队的顺序。
