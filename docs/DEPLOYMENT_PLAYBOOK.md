# 分红银行 GameFi 主网部署作战手册

## 1. 文档目的

这是一份按执行顺序编排的主网部署教程，面向实际操作人员。

适用目标：

- 将分红银行 GameFi 部署到 BSC 主网
- 先完成整套核心合约部署
- 再完成 NFT 铸造、Element 上架、dApp 发布
- 最后完成主网彩排和权限交接

这份文档基于以下顺序设计：

- 先部署整套核心合约
- 可以在整套部署完成后，先发 NFT、先上 Element
- 不建议先单独做 NFT 项目部署，再后补其他模块

配套文档：

- [`DEPLOYMENT_SEQUENCE_DETAILED.md`](/Users/chih/Documents/NFT/分红银行/docs/DEPLOYMENT_SEQUENCE_DETAILED.md)
- [`DEPLOYMENT_AND_OPERATIONS.md`](/Users/chih/Documents/NFT/分红银行/docs/DEPLOYMENT_AND_OPERATIONS.md)

## 2. 参与角色

建议至少准备以下钱包：

- `部署钱包`
  - 用于部署合约、配置 VRF、早期验证、首轮铸造
  - 在最终交权前保留临时高权限
- `最终管理员/多签钱包`
  - 对应 `MULTISIG_ADMIN`
  - 作为最终系统 admin
- `运营钱包`
  - 对应 `OPERATOR_WALLET`
  - 负责 VRF 运维、退款处理、游戏管理
- `暂停钱包`
  - 对应 `PAUSER_WALLET`
  - 负责紧急暂停
- `收益运营钱包`
  - 对应 `REVENUE_OPERATOR_WALLET`
  - 负责回购、收益调整
- `自动化钱包`
  - 对应 `AUTOMATION_WALLET`
  - 负责每日快照
- `NFT 铸造钱包`
  - 对应 `NFT_MINTER_WALLET`
  - 如与部署钱包相同，也要明确记录
- `NFT 元数据钱包`
  - 对应 `NFT_METADATA_WALLET`
  - 负责更新 base URI

执行原则：

- 最终交权前，不要过早让部署钱包 `renounce`
- 上线当天至少要同时在线：
  - 部署钱包持有人
  - 运营负责人
  - 最终管理员或多签控制人

## 3. 主网部署总体顺序

上线推荐顺序：

1. 准备主网参数与钱包
2. 准备 `.env` 和 `web/.env`
3. 检查本地构建环境
4. 配置并确认 VRF subscription 参数
5. 部署整套核心合约
6. 回填部署地址
7. 配置 VRF
8. 注入 `BankrollVault` 首轮 FLAP
9. 小批量铸造 NFT
10. 验证 NFT 元数据、持仓、转账
11. Element 识别和小额挂单/购买验证
12. 构建和发布 dApp
13. 主网小流量彩排
14. 全量铸造或补铸
15. 完成合约验证
16. 最终权限交接
17. 进入日常运维

## 4. 部署前准备

### 4.1 准备本地目录

项目根目录：

```bash
/Users/chih/Documents/NFT/分红银行
```

前端目录：

```bash
/Users/chih/Documents/NFT/分红银行/web
```

## 4.2 准备主网依赖

上线前必须确认：

- BSC 主网 RPC 可用
- FLAP 主网地址已确认
- FLAP Dividend 主网地址已确认
- WBNB 主网地址已确认
- Pancake Router V2 主网地址已确认
- Chainlink VRF 主网 coordinator、key hash、subscription 已确认
- VRF subscription 已充值
- 部署钱包有足够 BNB
- 资金钱包有首轮 FLAP

## 4.3 准备环境变量

先复制环境模板：

```bash
cd /Users/chih/Documents/NFT/分红银行
cp .env.example .env

cd /Users/chih/Documents/NFT/分红银行/web
cp .env.example .env
```

## 4.4 填写 `.env`

至少先填写这些部署前就应明确的字段：

```env
DEPLOYER_PRIVATE_KEY=
BSC_RPC_URL=

FLAP_TOKEN=
FLAP_DIVIDEND=
WBNB_TOKEN=
PANCAKE_ROUTER_V2=

NFT_NAME=Dividend Bank Genesis
NFT_SYMBOL=DBANK
NFT_BASE_URI=
NFT_ROYALTY_RECEIVER=
NFT_ROYALTY_BPS=500

MULTISIG_ADMIN=
OPERATOR_WALLET=
PAUSER_WALLET=
REVENUE_OPERATOR_WALLET=
AUTOMATION_WALLET=
NFT_MINTER_WALLET=
NFT_METADATA_WALLET=

VRF_COORDINATOR=
VRF_KEY_HASH=
VRF_SUBSCRIPTION_ID=
VRF_REQUEST_CONFIRMATIONS=3
VRF_CALLBACK_GAS_LIMIT=600000
```

此时先不用填写这些部署后地址：

```env
SYSTEM_ACCESS_CONTROL=
GAME_MANAGER=
BANKROLL_VAULT=
INCOME_POOL=
DIVIDEND_BANK_NFT=
NFT_REVENUE_DISTRIBUTOR=
```

## 4.5 填写 `web/.env`

先填写部署前已知的字段：

```env
VITE_WALLETCONNECT_PROJECT_ID=
VITE_BSC_RPC_URL=https://bsc-dataseed.binance.org
VITE_FLAP_TOKEN_ADDRESS=
VITE_FLAP_DIVIDEND_ADDRESS=
VITE_ELEMENT_NFT_URL=
```

此时先不用填写部署后地址：

```env
VITE_SYSTEM_ACCESS_CONTROL_ADDRESS=
VITE_REFERRAL_REGISTRY_ADDRESS=
VITE_GAME_REGISTRY_ADDRESS=
VITE_GAME_MANAGER_ADDRESS=
VITE_BANKROLL_VAULT_ADDRESS=
VITE_INCOME_POOL_ADDRESS=
VITE_DIVIDEND_BANK_NFT_ADDRESS=
VITE_NFT_REVENUE_DISTRIBUTOR_ADDRESS=
```

## 4.6 本地工具检查

在项目根目录执行：

```bash
cd /Users/chih/Documents/NFT/分红银行
forge --version
```

在前端目录执行：

```bash
cd /Users/chih/Documents/NFT/分红银行/web
npm --version
```

成功判定：

- `forge` 可执行
- `npm` 可执行
- 依赖已安装完成

如果前端依赖未安装：

```bash
cd /Users/chih/Documents/NFT/分红银行/web
npm install
```

## 5. 部署前总检查

上线前，在根目录执行一次最后确认：

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
```

人工核对：

- `DEPLOYER_PRIVATE_KEY` 对应的是部署钱包
- `MULTISIG_ADMIN` 是最终控制钱包
- `NFT_BASE_URI` 是最终准备使用的 URI
- `NFT_ROYALTY_RECEIVER` 是最终收版税的钱包
- `FLAP_TOKEN` 与 `FLAP_DIVIDEND` 是主网真实地址
- VRF 参数来自主网，不是测试网

不要继续下一步，除非上述全部确认。

## 6. 部署核心合约

### 6.1 执行部署命令

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/DeployGameFi.s.sol:DeployGameFi --rpc-url $BSC_RPC_URL --broadcast
```

### 6.2 这一步会部署什么

该脚本会一次性部署：

- `SystemAccessControl`
- `ReferralRegistry`
- `GameRegistry`
- `IncomePool`
- `BankrollVault`
- `GameManager`
- `CoinFlipModule`
- `DiceModule`
- `MysteryBoxModule`
- `DividendBankNFT` implementation
- `DividendBankNFT` proxy
- `NftRevenueDistributor`

### 6.3 成功判定

部署成功后，应该生成：

```bash
/Users/chih/Documents/NFT/分红银行/deployments/<chainId>.json
```

### 6.4 如果失败

常见原因：

- `.env` 有空值
- 部署钱包 BNB 不足
- RPC 不稳定
- NFT 参数填错

处理方法：

1. 不要立即继续第二次部署
2. 先记录失败交易哈希
3. 修正参数后重新评估
4. 如果链上已经部分成功部署，不要盲目重复广播，先对照区块浏览器确认状态

## 7. 部署后地址回填

### 7.1 打开部署清单

生成文件位于：

```bash
/Users/chih/Documents/NFT/分红银行/deployments/<chainId>.json
```

关键字段包括：

- `systemAccessControl`
- `referralRegistry`
- `gameRegistry`
- `incomePool`
- `bankrollVault`
- `gameManager`
- `coinFlipModule`
- `diceModule`
- `mysteryBoxModule`
- `dividendBankNftImplementation`
- `dividendBankNftProxy`
- `nftRevenueDistributor`

### 7.2 回填 `.env`

将以下值回填：

```env
SYSTEM_ACCESS_CONTROL=<systemAccessControl>
GAME_MANAGER=<gameManager>
BANKROLL_VAULT=<bankrollVault>
INCOME_POOL=<incomePool>
DIVIDEND_BANK_NFT=<dividendBankNftProxy>
NFT_REVENUE_DISTRIBUTOR=<nftRevenueDistributor>
```

注意：

- `DIVIDEND_BANK_NFT` 必须填 `proxy` 地址
- 不要填 implementation 地址

### 7.3 回填 `web/.env`

将以下值回填：

```env
VITE_SYSTEM_ACCESS_CONTROL_ADDRESS=<systemAccessControl>
VITE_REFERRAL_REGISTRY_ADDRESS=<referralRegistry>
VITE_GAME_REGISTRY_ADDRESS=<gameRegistry>
VITE_GAME_MANAGER_ADDRESS=<gameManager>
VITE_BANKROLL_VAULT_ADDRESS=<bankrollVault>
VITE_INCOME_POOL_ADDRESS=<incomePool>
VITE_DIVIDEND_BANK_NFT_ADDRESS=<dividendBankNftProxy>
VITE_NFT_REVENUE_DISTRIBUTOR_ADDRESS=<nftRevenueDistributor>
```

### 7.4 回填后的检查

人工确认：

- `.env` 的 NFT 地址是 proxy
- `web/.env` 的 NFT 地址也是 proxy
- `gameManager`、`incomePool`、`bankrollVault` 没填串

## 8. 配置 VRF

### 8.1 执行配置脚本

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/ConfigureVrf.s.sol:ConfigureVrf --rpc-url $BSC_RPC_URL --broadcast
```

### 8.2 到 VRF 管理界面完成 consumer 配置

把 `GAME_MANAGER` 地址加入当前 VRF subscription 的 consumer 列表。

### 8.3 成功判定

满足以下条件：

- `GameManager` 链上已经写入 coordinator、key hash、subscription id
- Chainlink VRF subscription 界面显示已添加 consumer
- subscription 余额充足

### 8.4 如果失败

常见原因：

- `GAME_MANAGER` 没回填
- `OPERATOR_WALLET` 或部署钱包权限不正确
- subscription id 错误
- coordinator 与主网不匹配

## 9. 注入首轮 FLAP 资金池

### 9.1 执行方式

用资金钱包直接向 `BANKROLL_VAULT` 地址转入 FLAP。

### 9.2 为什么不能省略

用户下注时，`BankrollVault` 会检查是否有足够可用 FLAP 覆盖潜在盈利。

### 9.3 推荐做法

先注入一笔足够支撑主网彩排的小流动性，不要一开始就上全部资金。

### 9.4 成功判定

至少确认：

- `BANKROLL_VAULT` 地址收到 FLAP
- 前端或链上查询能看到余额
- 后续最小下注不会因为资金池不足而失败

## 10. 小批量铸造 NFT

### 10.1 先设置铸造参数

在 `.env` 中填写：

```env
NFT_MINT_RECIPIENT=<运营方钱包>
NFT_MINT_TOTAL_QUANTITY=5
NFT_MINT_CHUNK_SIZE=5
```

### 10.2 执行铸造

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/MintDividendBankNft.s.sol:MintDividendBankNft --rpc-url $BSC_RPC_URL --broadcast
```

### 10.3 成功判定

检查：

- `totalSupply()` 增加到 `5`
- 接收钱包 `balanceOf()` 为 `5`
- `tokenOfOwnerByIndex()` 能列出对应 token id

### 10.4 为什么先小批量

先验证：

- 铸造权限正常
- 合约没填错
- 元数据能否正确显示
- Element 能否识别
- 持仓页面能否正确展示

## 11. NFT 元数据、自持仓、转账验证

### 11.1 元数据验证

检查：

- 钱包内 NFT 名称是否正确
- 图片是否能加载
- 描述、属性是否正常

如果异常：

- 优先检查 `NFT_BASE_URI`
- 如需修正，用 `METADATA_ROLE` 后续更新

### 11.2 自持仓验证

在 dApp 的 NFT 页面检查：

- 是否显示 NFT 合约地址
- 是否能显示自己持有的 token id

### 11.3 链上转账验证

用钱包 A 向钱包 B 转一只 NFT。

验证：

- 钱包 A `balanceOf()` 减少
- 钱包 B `balanceOf()` 增加
- dApp NFT 页面显示跟链上同步

## 12. Element 上架前验证

### 12.1 先让 Element 识别合集

使用 `DIVIDEND_BANK_NFT` 地址在 Element 中检查合集。

### 12.2 检查项

- 合集名称
- symbol
- 总量
- 持有人数量
- 版税接收地址
- 版税比例

### 12.3 如果识别异常

优先排查：

- NFT 元数据是否可访问
- base URI 是否正确
- Element 是否需要缓存刷新时间

不要继续大量挂单，除非识别正常。

## 13. Element 小额挂单与购买验证

### 13.1 小额挂单

用运营钱包挂出一只测试 NFT，价格用最小可接受测试价。

### 13.2 小额购买

用受控测试钱包买入。

### 13.3 验证项

- 挂单成功
- 买入成功
- NFT 所有权变更正确
- 版税路径符合预期
- 前端 NFT 页面持仓变化正确

### 13.4 为什么不能直接跳过

因为 Element 能识别合集，不代表首单交易一定没问题。

## 14. 构建和发布 dApp

### 14.1 发布前检查 `web/.env`

确认这些都已填写：

- `VITE_WALLETCONNECT_PROJECT_ID`
- `VITE_BSC_RPC_URL`
- `VITE_FLAP_TOKEN_ADDRESS`
- `VITE_FLAP_DIVIDEND_ADDRESS`
- 所有部署后地址
- `VITE_ELEMENT_NFT_URL`

### 14.2 构建

```bash
cd /Users/chih/Documents/NFT/分红银行/web
npm run build
```

### 14.3 成功判定

应生成：

```bash
/Users/chih/Documents/NFT/分红银行/web/dist
```

### 14.4 发布

将 `web/dist` 发布到你们使用的静态站点或 CDN。

### 14.5 发布后烟雾测试

至少逐页检查：

- 首页
- 游戏页
- NFT 页
- 收益页
- 邀请页
- 管理页

## 15. 主网小流量彩排

这是正式开放前必须做的一轮完整验证。

### 15.1 普通用户钱包验证

执行：

1. 连接钱包
2. 切换到 BSC 主网
3. 检查 FLAP 余额
4. 授权 `BANKROLL_VAULT`
5. 发起最小下注

### 15.2 游戏结算验证

检查：

- 注单进入 `Pending`
- VRF 回调成功
- 注单成功进入 `Settled`
- 输局和赢局分账都符合预期

### 15.3 NFT 持有人验证

检查：

1. 到快照窗口内执行 `snapshotAndPull()`
2. NFT 持有人可 `previewClaim`
3. NFT 持有人可 `claim()`
4. 历史场景下可 `claimBatch()`

### 15.4 回购验证

执行：

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/HarvestAndBuyback.s.sol:HarvestAndBuyback --rpc-url $BSC_RPC_URL --broadcast
```

检查：

- `BankrollVault` 成功领取 WBNB 分红
- WBNB 能转到 `IncomePool`
- `IncomePool` 能完成 `[WBNB, FLAP]` 路径回购

### 15.5 管理页验证

用有权限的钱包检查：

- 角色显示
- 暂停/恢复状态
- 当日快照按钮
- 退款按钮

## 16. 全量铸造或补铸

### 16.1 什么时候做

建议在以下条件都通过后再做：

- 小批量 mint 正常
- Element 识别正常
- 前端 NFT 页面正常
- 主网小流量彩排正常

### 16.2 如何执行

调整 `.env`：

```env
NFT_MINT_RECIPIENT=<运营方钱包或最终分发钱包>
NFT_MINT_TOTAL_QUANTITY=420
NFT_MINT_CHUNK_SIZE=20
```

再执行铸造脚本。

### 16.3 分发建议

如果需要分发给多个地址：

- 先做 1 到 2 笔测试分发
- 再批量分发
- 每轮分发后抽查余额和持仓

## 17. 合约验证

至少验证：

- `SystemAccessControl`
- `ReferralRegistry`
- `GameRegistry`
- `IncomePool`
- `BankrollVault`
- `GameManager`
- `CoinFlipModule`
- `DiceModule`
- `MysteryBoxModule`
- `DividendBankNFT` implementation
- `DividendBankNFT` proxy
- `NftRevenueDistributor`

建议保留：

- 所有部署交易哈希
- 所有验证页面链接
- 最终部署清单

## 18. 最终权限交接

### 18.1 交权前必须全部满足

- 核心合约已部署
- 地址已回填
- VRF 正常
- 首轮资金池已注入
- NFT 已验证
- Element 已验证
- dApp 已验证
- 主网小流量彩排已通过
- 合约验证已完成

### 18.2 执行交权

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/FinalizeMultisigHandover.s.sol:FinalizeMultisigHandover --rpc-url $BSC_RPC_URL --broadcast
```

### 18.3 交权后检查

确认：

- 部署钱包不再有 admin 类权限
- `MULTISIG_ADMIN` 已拥有最终权限
- 运营钱包仍保有其业务所需角色

## 19. 上线当天执行清单

上线当天按以下顺序逐项打勾：

1. `.env` 最终版备份
2. `web/.env` 最终版备份
3. 部署钱包 BNB 余额确认
4. VRF subscription 余额确认
5. 所有主网地址人工复核
6. 部署清单存在
7. dApp 最新版本已发布
8. 普通用户钱包下注通过
9. NFT 页面显示正常
10. Element 首单正常
11. 快照流程正常
12. 回购流程正常
13. 最终是否交权的内部确认

## 20. 日常运维教程

### 20.1 每日 NFT 快照

执行：

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/RunDailySnapshot.s.sol:RunDailySnapshot --rpc-url $BSC_RPC_URL --broadcast
```

时间要求：

- UTC+8 00:00 后
- 默认 10 分钟窗口内

### 20.2 WBNB 分红领取与回购

执行：

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/HarvestAndBuyback.s.sol:HarvestAndBuyback --rpc-url $BSC_RPC_URL --broadcast
```

执行前必须确认：

- `BUYBACK_MIN_FLAP_OUT` 已按最新报价设置

### 20.3 管理页可做的事

当前 `/admin` 页面支持：

- 角色查看
- `pause()`
- `unpause()`
- 当日快照
- `refundPendingBet()`

### 20.4 运维台账必须保留

至少保留：

- 部署清单
- `.env`
- `web/.env`
- VRF subscription 信息
- 每日快照记录
- 每日回购记录
- NFT 分发记录
- Element 首发和测试成交记录
- 异常处理记录

## 21. 常见错误与处理

### 21.1 VRF 正常配置但游戏不结算

排查：

- `GameManager` 是否在 consumer 列表
- subscription 是否有余额
- key hash 是否正确
- coordinator 是否为主网地址

### 21.2 首笔下注失败

优先排查：

- 用户是否 `approve(BankrollVault)`
- `BankrollVault` 是否有足够 FLAP
- VRF 是否配置完成

### 21.3 NFT 页面显示正常，但 Element 不识别

优先排查：

- base URI 是否可访问
- Element 是否仍在抓取
- 是否刚铸造不久，需要缓存刷新时间

### 21.4 快照失败

优先排查：

- 是否已超过窗口
- `AUTOMATION_WALLET` 是否有权限
- 当日是否已执行过一次
- NFT 是否已有供应量

### 21.5 回购失败

优先排查：

- `BUYBACK_MIN_FLAP_OUT` 是否过高
- `IncomePool` 是否确实持有 WBNB
- Pancake 路由地址是否正确

## 22. 不要做的事

- 不要在当前默认流程下，先单独铸造 NFT 再部署整套合约
- 不要把 `DIVIDEND_BANK_NFT` 填成 implementation 地址
- 不要在 VRF 未验证前就大规模开放游戏
- 不要在 Element 首单未验证前就大规模上架
- 不要在主网彩排前就交出部署钱包权限
- 不要在没有备份 `.env` 和 `web/.env` 的情况下上线

## 23. 最终建议

最稳的上线节奏是：

1. 先部署整套
2. 先配好 VRF 和资金池
3. 先小批量 mint NFT
4. 先验证 NFT 和 Element
5. 再发布 dApp
6. 再做主网小流量彩排
7. 再全量开放
8. 最后交权

如果业务上想要“先发 NFT，后开游戏”，建议也采用这个底层顺序，只是在外部节奏上先推动 NFT 市场动作，而不是改变底层部署模型。
