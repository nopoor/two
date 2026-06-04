# 分红银行 GameFi 主网部署 SOP

## 目标

这份文档只做一件事：

- 按推荐部署顺序，把项目部署到 BSC 主网

每一步只回答 4 个问题：

1. 进哪个目录
2. 执行什么命令
3. 这一步要填哪些参数
4. 这些参数从哪来

## 固定目录

- 项目根目录：`/Users/chih/Documents/NFT/分红银行`
- 前端目录：`/Users/chih/Documents/NFT/分红银行/web`

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

- 老板已单独提供运营自动化钱包私钥，但出于安全原因，不在仓库文档中回填明文私钥。
- 如需用该钱包执行 `RunDailySnapshot`、`HarvestAndBuyback` 等广播脚本，请在本地机器手工写入 `.env` 的 `DEPLOYER_PRIVATE_KEY`，并确保 `.env` 不入库、不截图、不外传。
- 当前执行原则是“你的钱包代部署，主钱包接最终权限”，所以 `DEPLOYER_PRIVATE_KEY` 对应的钱包不应被填写到 `MULTISIG_ADMIN`。

---

## 第 1 步：准备 `.env`

### 进入目录

```bash
cd /Users/chih/Documents/NFT/分红银行
cp .env.example .env
```

### 这一步先填这些参数

```env
DEPLOYER_PRIVATE_KEY=
BSC_RPC_URL=

FLAP_TOKEN=0x1b2884470a5de9a39dc234a20141146de6b67777
FLAP_DIVIDEND=0x7BAf5A394183Ff0C3592aD5980Db524CD2e7881E
WBNB_TOKEN=0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
PANCAKE_ROUTER_V2=0x10ED43C718714eb63d5aA57B78B54704E256024E

NFT_NAME=分红银行
NFT_SYMBOL=分红银行
NFT_BASE_URI=
NFT_ROYALTY_RECEIVER=0xEa9eDE1d6Fb9aDe1398Fe2423AeaAA64d7364d01
NFT_ROYALTY_BPS=400

MULTISIG_ADMIN=0xEa9eDE1d6Fb9aDe1398Fe2423AeaAA64d7364d01
OPERATOR_WALLET=
PAUSER_WALLET=
REVENUE_OPERATOR_WALLET=
AUTOMATION_WALLET=0x487aA7Fc6643A20Ea816DEA562FBc53D4AB0cA8b
NFT_MINTER_WALLET=
NFT_METADATA_WALLET=

VRF_COORDINATOR=
VRF_KEY_HASH=
VRF_SUBSCRIPTION_ID=
VRF_REQUEST_CONFIRMATIONS=3
VRF_CALLBACK_GAS_LIMIT=600000
```

### 这些参数从哪来

- `DEPLOYER_PRIVATE_KEY`
  - 你实际执行广播的热钱包私钥
  - 建议带 `0x`
  - 当前部署脚本使用 `vm.envUint` 读取，十六进制私钥如果不带 `0x` 会解析失败
  - 老板已单独提供自动化钱包私钥，但不要把私钥明文写进文档、聊天记录或 git 提交

- `BSC_RPC_URL`
  - 你的 BSC 主网 RPC 服务商

- `FLAP_TOKEN`
  - 项目既定主网 FLAP 地址
  - 当前仓库默认值已经填好

- `FLAP_DIVIDEND`
  - 项目既定主网 FLAP 分红合约地址
  - 当前仓库默认值已经填好

- `WBNB_TOKEN`
  - BSC 主网 WBNB 固定地址
  - 当前仓库默认值已经填好

- `PANCAKE_ROUTER_V2`
  - Pancake V2 Router 主网地址
  - 当前仓库默认值已经填好

- `NFT_NAME`
  - 当前主网确认填写：`分红银行`

- `NFT_SYMBOL`
  - 当前主网确认填写：`分红银行`

- `NFT_BASE_URI`
  - 你的 NFT 元数据前缀
  - 例如：`https://xxx.com/metadata/`

- `NFT_ROYALTY_RECEIVER`
  - 当前主网确认填写主钱包：`0xEa9eDE1d6Fb9aDe1398Fe2423AeaAA64d7364d01`

- `NFT_ROYALTY_BPS`
  - 版税比例
  - 当前主网确认填写 `400`，即 `4%`

- `MULTISIG_ADMIN`
  - 最终 owner 钱包或多签地址
  - 部署时只需要地址，不需要把这个钱包私钥交给部署方
  - 当前主网确认填写：`0xEa9eDE1d6Fb9aDe1398Fe2423AeaAA64d7364d01`

- `OPERATOR_WALLET`
  - 日常运营钱包
  - 用于退款等运营动作，不负责游戏上线开关
  - 当前老板只明确了自动化脚本钱包，是否单独配置 `OPERATOR_WALLET` 需上线前再确认

- `PAUSER_WALLET`
  - 紧急暂停钱包

- `REVENUE_OPERATOR_WALLET`
  - 收益和回购运营钱包
  - 如果你们只准备 1 个运营钱包，这里可以和 `OPERATOR_WALLET` 填同一个地址

- `AUTOMATION_WALLET`
  - 每日快照执行钱包
  - 当前主网确认填写：`0x487aA7Fc6643A20Ea816DEA562FBc53D4AB0cA8b`

- `NFT_MINTER_WALLET`
  - NFT 铸造钱包

- `NFT_METADATA_WALLET`
  - NFT 元数据管理钱包

- `VRF_COORDINATOR`
  - Chainlink VRF 主网 coordinator

- `VRF_KEY_HASH`
  - Chainlink VRF 主网 gas lane / key hash

- `VRF_SUBSCRIPTION_ID`
  - Chainlink VRF 主网 subscription id

- `VRF_REQUEST_CONFIRMATIONS`
  - VRF 请求确认数
  - 推荐保持 `3`

- `VRF_CALLBACK_GAS_LIMIT`
  - VRF 回调 gas 限额
  - 推荐保持 `600000`

### 这一步先不要填

这些都等部署完成后再回填：

```env
SYSTEM_ACCESS_CONTROL=
GAME_MANAGER=
BANKROLL_VAULT=
INCOME_POOL=
DIVIDEND_BANK_NFT=
NFT_REVENUE_DISTRIBUTOR=
```

### 第 1 步补充：准备 NFT 元数据托管

这一步建议在正式部署前就准备好，否则后面 NFT 虽然能 mint，但钱包和 Element 可能暂时读不到正确的元数据。

### 你最终要实现的访问结果

当前 NFT 合约会把：

- `NFT_BASE_URI`
- `tokenId`

直接拼成最终 `tokenURI`。

也就是说，如果你填写：

```env
NFT_BASE_URI=https://assets.dividendbank.com/nft/
```

那么链上实际读取的是：

- `https://assets.dividendbank.com/nft/1`
- `https://assets.dividendbank.com/nft/2`
- ...
- `https://assets.dividendbank.com/nft/420`

注意：

- 当前合约默认不会自动补 `.json`
- 所以你的服务端必须让 `/nft/1` 这种地址直接返回 JSON

### 域名和服务器应该怎么配

可以把下面两个域名都解析到老板提供的同一台服务器 IP：

- `https://www.dividendbank.com`
- `https://assets.dividendbank.com`

但不只是做 DNS 解析，还要在服务器上分别配置两个站点：

- `www.dividendbank.com`
  - 用来发布 dApp 前端，也就是 `web/dist`
- `assets.dividendbank.com`
  - 用来发布 NFT 元数据和图片

### 推荐目录结构

如果使用同一台服务器，推荐至少准备：

```text
/var/www/dividendbank/web/dist/
/var/www/dividendbank/assets/nft/
/var/www/dividendbank/assets/images/
```

其中：

- `/var/www/dividendbank/web/dist/`
  - 放前端构建产物
- `/var/www/dividendbank/assets/nft/`
  - 放 NFT 元数据 JSON
- `/var/www/dividendbank/assets/images/`
  - 放 NFT 图片

### 元数据文件怎么命名

如果 `NFT_BASE_URI=https://assets.dividendbank.com/nft/`，推荐直接按 token id 命名文件：

```text
/var/www/dividendbank/assets/nft/1
/var/www/dividendbank/assets/nft/2
/var/www/dividendbank/assets/nft/3
...
/var/www/dividendbank/assets/nft/420
```

也就是：

- 文件名直接叫 `1`、`2`、`3`
- 不依赖 `.json` 后缀

### 单个 NFT 元数据示例

例如 `tokenId = 1`，对应内容可以是：

```json
{
  "name": "分红银行 #1",
  "description": "分红银行 Genesis NFT",
  "image": "https://assets.dividendbank.com/images/001.PNG",
  "attributes": [
    {
      "trait_type": "Series",
      "value": "Genesis"
    }
  ]
}
```

### 这一步要做的具体动作

1. 把 `www.dividendbank.com` 和 `assets.dividendbank.com` 都解析到老板服务器 IP。
2. 给两个域名都配置 HTTPS。
3. 在服务器上创建上面的目录结构。
4. 在本地项目根目录先批量生成 NFT 元数据文件：

```bash
cd /Users/chih/Documents/NFT/分红银行
node tools/generate-nft-metadata.mjs
```

默认会生成到：

```text
/Users/chih/Documents/NFT/分红银行/metadata/generated/
```

并按下面的方式输出：

```text
metadata/generated/1
metadata/generated/2
...
metadata/generated/420
```

脚本默认已经兼容你当前的图片命名：

- `1 -> 001.PNG`
- `2 -> 002.PNG`
- `420 -> 420.PNG`

如需修改描述文案，可执行：

```bash
cd /Users/chih/Documents/NFT/分红银行
node tools/generate-nft-metadata.mjs --description "分红银行正式版 NFT"
```

5. 上传生成后的 NFT 元数据文件到 `/var/www/dividendbank/assets/nft/`。
5. 上传 NFT 图片到 `/var/www/dividendbank/assets/images/`。
6. 配置站点，让：
   - `https://assets.dividendbank.com/nft/1` 返回 1 号 NFT 的 JSON
   - `https://assets.dividendbank.com/images/001.PNG` 返回对应图片
7. 确认浏览器直接访问这些 URL 没有 404、没有鉴权、没有跳转错误。
8. 然后再把 `.env` 里的 `NFT_BASE_URI` 填成：

```env
NFT_BASE_URI=https://assets.dividendbank.com/nft/
```

### 上链前必须自测

至少手工检查：

```text
https://assets.dividendbank.com/nft/1
https://assets.dividendbank.com/nft/2
https://assets.dividendbank.com/images/001.PNG
```

只有这些地址都能正常访问后，才建议继续 mint。

---

## 第 2 步：准备 `web/.env`

### 进入目录

```bash
cd /Users/chih/Documents/NFT/分红银行/web
cp .env.example .env
```

### 这一步先填这些参数

```env
VITE_WALLETCONNECT_PROJECT_ID=
VITE_BSC_RPC_URL=https://你的BSC主网RPC
VITE_FLAP_TOKEN_ADDRESS=0x1b2884470a5de9a39dc234a20141146de6b67777
VITE_FLAP_DIVIDEND_ADDRESS=0x7BAf5A394183Ff0C3592aD5980Db524CD2e7881E
VITE_ELEMENT_NFT_URL=
```

### 这些参数从哪来

- `VITE_WALLETCONNECT_PROJECT_ID`
  - WalletConnect 后台创建的项目 ID

- `VITE_BSC_RPC_URL`
  - 你的前端主网 RPC

- `VITE_FLAP_TOKEN_ADDRESS`
  - 主网 FLAP 地址

- `VITE_FLAP_DIVIDEND_ADDRESS`
  - 主网 FLAP Dividend 地址

- `VITE_ELEMENT_NFT_URL`
  - 先留空
  - 等 Element 合集页可访问后再填

补充：

- 正式上线后，前端最终访问域名是：`https://www.dividendbank.com`

### 这一步先不要填

这些都等部署完成后回填：

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

---

## 第 3 步：部署前检查

### 进入目录

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
```

### 执行这些检查

```bash
forge --version
```

```bash
cd /Users/chih/Documents/NFT/分红银行/web
npm --version
```

### 这一步确认什么

- `.env` 已填完第 1 步要求的字段
- `web/.env` 已填完第 2 步要求的字段
- 部署钱包有足够 BNB
- VRF subscription 已创建并充值
- `NFT_BASE_URI` 已确定，或你明确知道后续要用 `METADATA_ROLE` 再改
- 当前默认首发状态是：`飞船模式开启`、`盲盒模式关闭`
- 盲盒后续由 owner 钱包连接 dApp 后台手动开启

---

## 第 4 步：部署整套核心合约

### 进入目录

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
```

### 执行命令

```bash
forge script script/DeployGameFi.s.sol:DeployGameFi --rpc-url $BSC_RPC_URL --broadcast
```

### 这一步依赖哪些参数

- 第 1 步填的全部部署前参数

### 这一步产出什么

部署清单：

```bash
/Users/chih/Documents/NFT/分红银行/deployments/<chainId>.json
```

### 这一步部署了什么

- `SystemAccessControl`
- `ReferralRegistry`
- `GameRegistry`
- `IncomePool`
- `BankrollVault`
- `GameManager`
- `CoinFlipModule`
- `MysteryBoxModule`
- `DividendBankNFT` implementation
- `DividendBankNFT` proxy
- `NftRevenueDistributor`

---

## 第 5 步：把部署后的地址回填到 `.env`

### 进入目录

```bash
cd /Users/chih/Documents/NFT/分红银行
```

### 打开部署清单

```bash
deployments/<chainId>.json
```

### 回填这些参数

```env
SYSTEM_ACCESS_CONTROL=部署清单里的 systemAccessControl
GAME_MANAGER=部署清单里的 gameManager
BANKROLL_VAULT=部署清单里的 bankrollVault
INCOME_POOL=部署清单里的 incomePool
DIVIDEND_BANK_NFT=部署清单里的 dividendBankNftProxy
NFT_REVENUE_DISTRIBUTOR=部署清单里的 nftRevenueDistributor
```

### 这些值从哪来

全部来自：

- `deployments/<chainId>.json`

### 这一点最重要

- `DIVIDEND_BANK_NFT` 必须填 `dividendBankNftProxy`
- 不要填 `dividendBankNftImplementation`

---

## 第 6 步：把部署后的地址回填到 `web/.env`

### 进入目录

```bash
cd /Users/chih/Documents/NFT/分红银行/web
```

### 回填这些参数

```env
VITE_SYSTEM_ACCESS_CONTROL_ADDRESS=部署清单里的 systemAccessControl
VITE_REFERRAL_REGISTRY_ADDRESS=部署清单里的 referralRegistry
VITE_GAME_REGISTRY_ADDRESS=部署清单里的 gameRegistry
VITE_GAME_MANAGER_ADDRESS=部署清单里的 gameManager
VITE_BANKROLL_VAULT_ADDRESS=部署清单里的 bankrollVault
VITE_INCOME_POOL_ADDRESS=部署清单里的 incomePool
VITE_DIVIDEND_BANK_NFT_ADDRESS=部署清单里的 dividendBankNftProxy
VITE_NFT_REVENUE_DISTRIBUTOR_ADDRESS=部署清单里的 nftRevenueDistributor
```

### 这些值从哪来

全部来自：

- `deployments/<chainId>.json`

---

## 第 7 步：配置 VRF

### 进入目录

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
```

### 执行命令

```bash
forge script script/ConfigureVrf.s.sol:ConfigureVrf --rpc-url $BSC_RPC_URL --broadcast
```

### 这一步要用到哪些参数

```env
GAME_MANAGER=
VRF_COORDINATOR=
VRF_KEY_HASH=
VRF_SUBSCRIPTION_ID=
VRF_REQUEST_CONFIRMATIONS=
VRF_CALLBACK_GAS_LIMIT=
```

### 这些参数从哪来

- `GAME_MANAGER`
  - 第 5 步回填

- `VRF_COORDINATOR`
  - Chainlink 主网资料

- `VRF_KEY_HASH`
  - Chainlink 主网资料

- `VRF_SUBSCRIPTION_ID`
  - 你创建好的主网 VRF subscription

- `VRF_REQUEST_CONFIRMATIONS`
  - 运营参数，默认 `3`

- `VRF_CALLBACK_GAS_LIMIT`
  - 运营参数，默认 `600000`

### 命令执行完后还要做一件事

去 Chainlink VRF 的网页控制台：

- 把 `GAME_MANAGER` 加入 subscription 的 consumer 列表

---

## 第 8 步：向 `BankrollVault` 注入首轮 FLAP

### 进入哪个目录

这一步不在项目目录执行脚本。

### 执行什么操作

用持有 FLAP 的运营钱包，直接向：

- `BANKROLL_VAULT`

转入首轮 FLAP。

### 这一步要用到哪些参数

```env
BANKROLL_VAULT=
FLAP_TOKEN=
```

### 这些参数从哪来

- `BANKROLL_VAULT`
  - 第 5 步回填

- `FLAP_TOKEN`
  - 第 1 步已填

### 建议

- 先不要上全部资金
- 先放一笔足够主网彩排的小流动性

---

## 第 9 步：先小批量铸造 NFT

### 进入目录

```bash
cd /Users/chih/Documents/NFT/分红银行
```

### 先改 `.env`

第一次建议这样填：

```env
NFT_MINT_RECIPIENT=运营方或测试持有钱包地址
NFT_MINT_TOTAL_QUANTITY=5
NFT_MINT_CHUNK_SIZE=5
```

### 执行命令

```bash
source .env
forge script script/MintDividendBankNft.s.sol:MintDividendBankNft --rpc-url $BSC_RPC_URL --broadcast
```

### 这一步要用到哪些参数

```env
DEPLOYER_PRIVATE_KEY=
DIVIDEND_BANK_NFT=
NFT_MINT_RECIPIENT=
NFT_MINT_TOTAL_QUANTITY=
NFT_MINT_CHUNK_SIZE=
```

### 这些参数从哪来

- `DIVIDEND_BANK_NFT`
  - 第 5 步回填的 proxy 地址

- `NFT_MINT_RECIPIENT`
  - 这轮你想接收 NFT 的钱包

- `NFT_MINT_TOTAL_QUANTITY`
  - 这轮 mint 数量
  - 第一次建议 `5`

- `NFT_MINT_CHUNK_SIZE`
  - 单笔 mint 数量
  - 第一次建议 `5`

---

## 第 10 步：验证 NFT 和转账

### 进入哪个目录

这一步主要是链上和前端人工验证。

### 验证什么

1. 检查 `totalSupply()` 是否正确
2. 检查接收钱包 `balanceOf()` 是否正确
3. 检查 `tokenOfOwnerByIndex()` 是否能列出 NFT 编号
4. 检查 NFT 钱包展示是否正常
5. 用钱包 A 向钱包 B 转一只 NFT
6. 检查转账后 A、B 持仓是否正确

### 这一步要用到哪些参数

```env
DIVIDEND_BANK_NFT=
VITE_DIVIDEND_BANK_NFT_ADDRESS=
```

### 这些参数从哪来

- 第 5 步和第 6 步回填

---

## 第 11 步：让 Element 识别合集并做首单验证

### 进入哪个目录

这一步不在本地脚本执行。

### 执行什么操作

在 Element 中使用：

- `DIVIDEND_BANK_NFT`

作为合集地址，检查：

1. 合集名称
2. symbol
3. 总量
4. 持仓
5. 版税接收地址
6. 版税比例

然后做两件事：

1. 小额挂单
2. 小额购买

### 这一步要用到哪些参数

```env
DIVIDEND_BANK_NFT=
NFT_ROYALTY_RECEIVER=
NFT_ROYALTY_BPS=
```

### 这些参数从哪来

- `DIVIDEND_BANK_NFT`
  - 第 5 步回填

- `NFT_ROYALTY_RECEIVER`
  - 第 1 步已填

- `NFT_ROYALTY_BPS`
  - 第 1 步已填

### 完成后补一项 `web/.env`

```env
VITE_ELEMENT_NFT_URL=Element 的合集页面链接
```

---

## 第 12 步：构建前端

### 进入目录

```bash
cd /Users/chih/Documents/NFT/分红银行/web
```

### 执行命令

```bash
npm run build
```

### 这一步要确保哪些参数已经填了

```env
VITE_WALLETCONNECT_PROJECT_ID=
VITE_BSC_RPC_URL=
VITE_FLAP_TOKEN_ADDRESS=
VITE_FLAP_DIVIDEND_ADDRESS=
VITE_SYSTEM_ACCESS_CONTROL_ADDRESS=
VITE_REFERRAL_REGISTRY_ADDRESS=
VITE_GAME_REGISTRY_ADDRESS=
VITE_GAME_MANAGER_ADDRESS=
VITE_BANKROLL_VAULT_ADDRESS=
VITE_INCOME_POOL_ADDRESS=
VITE_DIVIDEND_BANK_NFT_ADDRESS=
VITE_NFT_REVENUE_DISTRIBUTOR_ADDRESS=
VITE_ELEMENT_NFT_URL=
```

### 这些参数从哪来

- 部署前参数：第 2 步
- 部署后地址：第 6 步
- Element 链接：第 11 步

### 构建产物

```bash
/Users/chih/Documents/NFT/分红银行/web/dist
```

---

## 第 13 步：发布前端

### 进入哪个目录

```bash
cd /Users/chih/Documents/NFT/分红银行/web
```

### 执行什么操作

把：

- `web/dist`

发布到你实际使用的静态站点或 CDN。

### 这一步文档里不写具体命令的原因

因为不同团队的发布方式不同，可能是：

- Nginx
- Vercel
- Cloudflare Pages
- OSS / COS / S3
- 自有服务器

你只需要记住：

- 真正上线的是 `web/dist`

---

## 第 14 步：做主网小流量彩排

### 进入目录

前端验证：

```bash
cd /Users/chih/Documents/NFT/分红银行/web
```

链上脚本验证：

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
```

### 这一步要做什么

普通用户钱包：

1. 连接钱包
2. 授权 FLAP 给 `BankrollVault`
3. 发起最小下注

运营钱包：

1. 确认注单进入 `Pending`
2. 确认 VRF 回调后成功结算

NFT 持有人钱包：

1. 等到快照窗口
2. 检查能否领取收益

### 收益快照脚本

```bash
forge script script/RunDailySnapshot.s.sol:RunDailySnapshot --rpc-url $BSC_RPC_URL --broadcast
```

### 回购脚本

执行前先在 `.env` 填：

```env
BUYBACK_MIN_FLAP_OUT=按最新报价计算的最小可接受FLAP数量
```

再执行：

```bash
forge script script/HarvestAndBuyback.s.sol:HarvestAndBuyback --rpc-url $BSC_RPC_URL --broadcast
```

### 这一步要用到哪些参数

```env
BANKROLL_VAULT=
INCOME_POOL=
NFT_REVENUE_DISTRIBUTOR=
BUYBACK_MIN_FLAP_OUT=
```

### 这些参数从哪来

- 部署后地址：第 5 步回填
- `BUYBACK_MIN_FLAP_OUT`
  - 广播前按最新报价自己重新计算

---

## 第 15 步：全量铸造或补铸

### 进入目录

```bash
cd /Users/chih/Documents/NFT/分红银行
```

### 先改 `.env`

如果准备全量铸造：

```env
NFT_MINT_RECIPIENT=最终主发行持仓钱包
NFT_MINT_TOTAL_QUANTITY=420
NFT_MINT_CHUNK_SIZE=20
```

### 执行命令

```bash
source .env
forge script script/MintDividendBankNft.s.sol:MintDividendBankNft --rpc-url $BSC_RPC_URL --broadcast
```

### 这些参数从哪来

- `NFT_MINT_RECIPIENT`
  - 最终持仓钱包或本轮分发钱包

- `NFT_MINT_TOTAL_QUANTITY`
  - 本轮想 mint 的真实数量

- `NFT_MINT_CHUNK_SIZE`
  - 单笔安全数量
  - 一般建议 `20`

---

## 第 16 步：最终交权

### 进入目录

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
```

### 执行命令

```bash
forge script script/FinalizeMultisigHandover.s.sol:FinalizeMultisigHandover --rpc-url $BSC_RPC_URL --broadcast
```

### 这一步要确保哪些参数已经填好

```env
SYSTEM_ACCESS_CONTROL=
DIVIDEND_BANK_NFT=
MULTISIG_ADMIN=
```

### 这些参数从哪来

- `SYSTEM_ACCESS_CONTROL`
  - 第 5 步回填

- `DIVIDEND_BANK_NFT`
  - 第 5 步回填的 proxy 地址

- `MULTISIG_ADMIN`
  - 第 1 步已填

### 什么时候才能执行这一步

必须等以下都做完：

1. 合约部署完成
2. 地址回填完成
3. VRF 配置完成
4. 首轮资金池已注入
5. NFT 已验证
6. Element 已验证
7. 前端已发布
8. 主网小流量彩排已通过

### 这一步执行后的权限结果

- `MULTISIG_ADMIN` 成为最终权限钱包。
- 你的代部署钱包完成全部 `renounce`，不再保留任何系统角色。
- 你的代部署钱包也不再保留 NFT 的 `DEFAULT_ADMIN_ROLE`、`MINTER_ROLE`、`METADATA_ROLE`。

---

## 第 17 步：日常运维只记这两个命令

### 每日快照

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/RunDailySnapshot.s.sol:RunDailySnapshot --rpc-url $BSC_RPC_URL --broadcast
```

### WBNB 领取和回购

先更新：

```env
BUYBACK_MIN_FLAP_OUT=
```

再执行：

```bash
cd /Users/chih/Documents/NFT/分红银行
source .env
forge script script/HarvestAndBuyback.s.sol:HarvestAndBuyback --rpc-url $BSC_RPC_URL --broadcast
```

---

## 最后给你的执行原则

如果你只记一句话，就记这个顺序：

1. 先填 `.env`
2. 先填 `web/.env`
3. 先部署整套
4. 再回填地址
5. 再配 VRF
6. 再注入 FLAP
7. 再小批量 mint NFT
8. 再验 NFT 和 Element
9. 再 build 和发布前端
10. 再做主网彩排
11. 再全量 mint
12. 最后交权
