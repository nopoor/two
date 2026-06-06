# 分红银行财富卡完整代部署手册

## 1. 文档目的

这是一份按真实仓库脚本整理出来的主网部署手册，目标是让你按步骤完成整套项目代部署，不依赖临场猜测。

这份手册覆盖 3 个部署面：

- `macOS`：部署合约、配置 VRF、铸造 NFT、完成交权
- `Debian 12`：托管 NFT 元数据、执行自动化脚本
- `Vercel`：部署 dApp 前端

这份手册的执行口径是：

- 参考仓库路径：`/Users/chih/Documents/NFT/分红银行`
- 实际 macOS 执行路径：`/Users/chih/Desktop/testdeploy`
- 实际 Debian 12 推荐路径：`/opt/dividendbank/app`

## 2. 本次部署固定参数

### 2.1 业务参数

- 项目名：`分红银行财富卡`
- NFT 名称：`分红银行财富卡`
- NFT 简称：`分红银行财富卡`
- NFT 最大供应量：`420`
- NFT 版税：`4%`
- 链：`BSC Mainnet`
- dApp 正式域名：`https://www.dividendbank.org`
- NFT 元数据域名：`https://assets.dividendbank.org`

### 2.2 钱包分工

- 代部署钱包地址：`0x4Dfd8FF6e1fd2A7d9eF61B6Fa91cE8812B6b50dE`
- 主钱包：`0xEa9eDE1d6Fb9aDe1398Fe2423AeaAA64d7364d01`
- 运营钱包：`0x487aA7Fc6643A20Ea816DEA562FBc53D4AB0cA8b`

### 2.3 本手册采用的角色映射

这是基于当前信息的推荐映射，优先保证稳定上线、权限清晰、少踩坑：

- `MULTISIG_ADMIN` = 主钱包
- `NFT_ROYALTY_RECEIVER` = 主钱包
- `OPERATOR_WALLET` = 运营钱包
- `REVENUE_OPERATOR_WALLET` = 运营钱包
- `AUTOMATION_WALLET` = 运营钱包
- `PAUSER_WALLET` = `0x0000000000000000000000000000000000000000`
- `NFT_MINTER_WALLET` = `0x0000000000000000000000000000000000000000`
- `NFT_METADATA_WALLET` = `0x0000000000000000000000000000000000000000`

这样设置的原因：

- `MULTISIG_ADMIN` 在 [DeployGameFi.s.sol](/Users/chih/Documents/NFT/分红银行/script/DeployGameFi.s.sol) 中会自动获得系统 admin、operator、pauser、revenue、game admin、automation，以及 NFT admin、minter、metadata 权限。
- 所以主钱包已经天然拥有暂停、修改版税、修改 base URI、后续补铸等能力。
- 运营钱包只额外拿日常执行所需的 `OPERATOR_ROLE`、`REVENUE_ROLE`、`AUTOMATION_ROLE`。
- 这能减少热钱包权限面，避免把 pause、NFT admin 这类高权限再给第二个钱包。

## 3. 先理解真实依赖关系

### 3.1 这套项目不是“先独立发 NFT，再慢慢补系统”

仓库真实部署入口是 [DeployGameFi.s.sol](/Users/chih/Documents/NFT/分红银行/script/DeployGameFi.s.sol)，它会一次性部署：

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

所以正确顺序不是“先单独发 NFT”，而是：

1. 先部署整套核心合约
2. 再配置 VRF
3. 再铸造 NFT
4. 再做 Element、前端、自动化、交权

### 3.2 NFT 元数据路径不是自动加 `.json`

在 [DividendBankNFT.sol](/Users/chih/Documents/NFT/分红银行/src/gamefi/nft/DividendBankNFT.sol) 里，`tokenURI` 来自 `baseURI + tokenId`。

如果你填写：

```env
NFT_BASE_URI=https://assets.dividendbank.org/nft/
```

那么链上钱包和市场实际会读取：

- `https://assets.dividendbank.org/nft/1`
- `https://assets.dividendbank.org/nft/2`
- ...
- `https://assets.dividendbank.org/nft/420`

不是：

- `https://assets.dividendbank.org/nft/1.json`

### 3.3 每日快照有 UTC+8 时间窗限制

在 [NftRevenueDistributor.sol](/Users/chih/Documents/NFT/分红银行/src/gamefi/revenue/NftRevenueDistributor.sol) 中：

- 日切按 `UTC+8`
- 默认快照窗口只有每天 `前 10 分钟`
- `RunDailySnapshot.s.sol` 调的是 `currentUtc8DayId()` + `snapshotAndPull(dayId)`

这意味着：

- 自动化脚本必须在每天 `00:00 - 00:10（UTC+8）` 内跑
- 最稳妥是每天 `00:01（Asia/Shanghai）`
- 同一天重复跑会 revert

### 3.4 回购脚本不能无脑全自动

在 [HarvestAndBuyback.s.sol](/Users/chih/Documents/NFT/分红银行/script/HarvestAndBuyback.s.sol) 中，`BUYBACK_MIN_FLAP_OUT` 是执行时读取的。

这意味着：

- 每次跑回购前，都要根据当时链上报价更新 `BUYBACK_MIN_FLAP_OUT`
- 如果把它写死，自动化脚本很容易因为滑点失败或成交条件失真

结论：

- `RunDailySnapshot` 适合定时自动化
- `HarvestAndBuyback` 更适合半自动执行，或者你后续自己补报价逻辑后再自动化

## 4. 正式执行前必须准备好的外部资源

### 4.1 账号与控制权

- GitHub 仓库访问权限
- Vercel 项目创建权限
- 域名 DNS 控制权
- Debian 12 服务器 root 或 sudo 权限
- BSC 主网 RPC
- Chainlink VRF Subscription 控制权
- WalletConnect Project ID
- Element 上架和合集认领操作权限

### 4.2 资金准备

- 代部署钱包需要足够 `BNB`
- 运营钱包需要少量 `BNB` 用于日常自动化广播
- 主钱包或运营钱包需要准备首轮注入 `BankrollVault` 的 `FLAP`
- 如果需要先挂售 NFT，持有 NFT 的钱包需要保留少量 `BNB`

### 4.3 建议你先准备的 5 个文本记录

- `部署参数表`
- `主网合约地址清单`
- `域名/DNS 记录表`
- `服务器目录与服务表`
- `交付清单`

后续每一步做完都回填进去，不要只靠聊天记录。

## 5. 目录规划

### 5.1 macOS

项目根目录：

```bash
/Users/chih/Desktop/testdeploy
```

前端目录：

```bash
/Users/chih/Desktop/testdeploy/web
```

### 5.2 Debian 12

推荐目录：

```bash
/opt/dividendbank/app
/opt/dividendbank/assets
/opt/dividendbank/assets/nft
/opt/dividendbank/assets/images
/opt/dividendbank/logs
```

## 6. 本次推荐的环境文件策略

不要只维护一个 `.env`，建议拆成 3 份。

### 6.1 macOS 合约部署环境

文件名建议：

```bash
/Users/chih/Desktop/testdeploy/.env.deploy
```

用途：

- 主网部署
- VRF 配置
- 铸造 NFT
- 最终交权

这里的 `DEPLOYER_PRIVATE_KEY` 应当填：

- `0x4Dfd8FF6e1fd2A7d9eF61B6Fa91cE8812B6b50dE` 对应私钥

### 6.2 Debian 12 自动化环境

文件名建议：

```bash
/opt/dividendbank/app/.env.server
```

用途：

- 每日快照
- 收益领取 / 回购

这里的 `DEPLOYER_PRIVATE_KEY` 应当填：

- 运营钱包 `0x487aA7Fc6643A20Ea816DEA562FBc53D4AB0cA8b` 对应私钥

注意：

- 运营钱包私钥你已经拿到
- 不要把私钥写进文档、截图、git 提交
- 手工写入服务器 `.env.server`

### 6.3 前端环境

文件名建议：

```bash
/Users/chih/Desktop/testdeploy/web/.env.production
```

用途：

- Vercel 生产构建

## 7. 先做 DNS 规划

### 7.1 域名拆分

- `www.dividendbank.org` -> Vercel
- `assets.dividendbank.org` -> Debian 12 服务器

### 7.2 推荐记录

- `www`：按 Vercel 后台要求设置 `CNAME`
- `assets`：设置到 Debian 12 公网 IP 的 `A` 记录
- `@` 根域：可选，建议在 Vercel 做 301 跳转到 `https://www.dividendbank.org`

### 7.3 DNS 生效后要先做的 2 个验证

- `ping assets.dividendbank.org` 或浏览器访问能命中 Debian 12
- `www.dividendbank.org` 已在 Vercel 后台显示域名验证成功

## 8. macOS 准备阶段

### 8.1 拉代码和确认目录

```bash
cd /Users/chih/Desktop/testdeploy
git status
```

确认：

- 这是与 `nopoor/two` 一致的代码
- 目录中有 `foundry.toml`
- 目录中有 `script/`、`src/`、`web/`

### 8.2 安装依赖

你至少要能正常使用：

- `git`
- `forge`
- `cast`
- `node`
- `npm`

前端只需要在 `web` 目录安装依赖：

```bash
cd /Users/chih/Desktop/testdeploy/web
npm install
```

### 8.3 准备 `.env.deploy`

在 `testdeploy` 根目录创建：

```env
DEPLOYER_PRIVATE_KEY=你的代部署钱包私钥
BSC_RPC_URL=你的BSC主网RPC

FLAP_TOKEN=0x1b2884470a5de9a39dc234a20141146de6b67777
FLAP_DIVIDEND=0x7BAf5A394183Ff0C3592aD5980Db524CD2e7881E
WBNB_TOKEN=0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
PANCAKE_ROUTER_V2=0x10ED43C718714eb63d5aA57B78B54704E256024E

NFT_NAME=分红银行财富卡
NFT_SYMBOL=分红银行财富卡
NFT_BASE_URI=https://assets.dividendbank.org/nft/
NFT_ROYALTY_RECEIVER=0xEa9eDE1d6Fb9aDe1398Fe2423AeaAA64d7364d01
NFT_ROYALTY_BPS=400

MULTISIG_ADMIN=0xEa9eDE1d6Fb9aDe1398Fe2423AeaAA64d7364d01
OPERATOR_WALLET=0x487aA7Fc6643A20Ea816DEA562FBc53D4AB0cA8b
PAUSER_WALLET=0x0000000000000000000000000000000000000000
REVENUE_OPERATOR_WALLET=0x487aA7Fc6643A20Ea816DEA562FBc53D4AB0cA8b
AUTOMATION_WALLET=0x487aA7Fc6643A20Ea816DEA562FBc53D4AB0cA8b
NFT_MINTER_WALLET=0x0000000000000000000000000000000000000000
NFT_METADATA_WALLET=0x0000000000000000000000000000000000000000

SYSTEM_ACCESS_CONTROL=
GAME_MANAGER=
BANKROLL_VAULT=
INCOME_POOL=
DIVIDEND_BANK_NFT=
NFT_REVENUE_DISTRIBUTOR=

NFT_MINT_RECIPIENT=
NFT_MINT_TOTAL_QUANTITY=420
NFT_MINT_CHUNK_SIZE=20

VRF_COORDINATOR=
VRF_KEY_HASH=
VRF_SUBSCRIPTION_ID=
VRF_REQUEST_CONFIRMATIONS=3
VRF_CALLBACK_GAS_LIMIT=600000

BUYBACK_MIN_FLAP_OUT=1
```

### 8.4 关于“不能留空”的说明

脚本中的很多地址字段使用 `vm.envAddress(...)` 读取。

这意味着：

- 你不能把需要读取的地址字段随意留空
- 不打算启用的地址，请明确填零地址

本次明确建议填零地址的字段：

- `PAUSER_WALLET`
- `NFT_MINTER_WALLET`
- `NFT_METADATA_WALLET`

### 8.5 导出环境变量

每次跑 `forge script` 前都这样做：

```bash
cd /Users/chih/Desktop/testdeploy
set -a
source .env.deploy
set +a
```

## 9. Debian 12 准备阶段

### 9.1 基础软件

服务器上至少要有：

- `git`
- `curl`
- `node`
- `npm`
- `nginx`
- `certbot`
- `python3-certbot-nginx`
- `forge`

### 9.2 建目录并拉代码

```bash
sudo mkdir -p /opt/dividendbank
sudo chown -R $USER:$USER /opt/dividendbank
cd /opt/dividendbank
git clone https://github.com/nopoor/two app
cd /opt/dividendbank/app
git status
```

### 9.3 服务器环境文件 `.env.server`

创建：

```bash
/opt/dividendbank/app/.env.server
```

内容与 `.env.deploy` 基本一致，但必须替换两点：

- `DEPLOYER_PRIVATE_KEY` 改成运营钱包私钥
- 部署完成后，把链上地址全部回填进去

即：

- `SYSTEM_ACCESS_CONTROL`
- `GAME_MANAGER`
- `BANKROLL_VAULT`
- `INCOME_POOL`
- `DIVIDEND_BANK_NFT`
- `NFT_REVENUE_DISTRIBUTOR`

### 9.4 服务器时区

因为每日快照按 `UTC+8` 前 10 分钟执行，建议服务器直接设为 `Asia/Shanghai`：

```bash
timedatectl set-timezone Asia/Shanghai
timedatectl
```

如果你不想改系统时区，也必须在 cron 里显式设置 `CRON_TZ=Asia/Shanghai`。

## 10. 生成并托管 NFT 元数据

### 10.1 图片准备

你需要先准备 420 张对应图片，命名要与元数据生成逻辑一致。

按仓库脚本 [generate-nft-metadata.mjs](/Users/chih/Documents/NFT/分红银行/tools/generate-nft-metadata.mjs) 的默认逻辑，图片名是：

- `001.PNG`
- `002.PNG`
- ...
- `420.PNG`

### 10.2 推荐服务器目录

```bash
/opt/dividendbank/assets/images
/opt/dividendbank/assets/nft
```

### 10.3 生成元数据

在 macOS 或 Debian 任一侧都可以执行，推荐先在 macOS 生成检查：

```bash
cd /Users/chih/Desktop/testdeploy
node tools/generate-nft-metadata.mjs \
  --output-dir metadata/prod \
  --image-base-url https://assets.dividendbank.org/images/ \
  --token-base-name 分红银行财富卡 \
  --description "分红银行财富卡 Genesis NFT"
```

生成结果会在：

```bash
/Users/chih/Desktop/testdeploy/metadata/prod
```

里面的文件名会是：

- `1`
- `2`
- ...
- `420`

### 10.4 上传元数据和图片到 Debian

目标结构：

```text
/opt/dividendbank/assets/nft/1
/opt/dividendbank/assets/nft/2
/opt/dividendbank/assets/nft/420
/opt/dividendbank/assets/images/001.PNG
/opt/dividendbank/assets/images/002.PNG
/opt/dividendbank/assets/images/420.PNG
```

### 10.5 Nginx 站点配置

创建站点：

```bash
sudo nano /etc/nginx/sites-available/assets.dividendbank.org
```

推荐配置：

```nginx
server {
    listen 80;
    server_name assets.dividendbank.org;

    root /opt/dividendbank/assets;

    location /nft/ {
        alias /opt/dividendbank/assets/nft/;
        add_header Content-Type application/json always;
        add_header Access-Control-Allow-Origin * always;
        try_files $uri =404;
    }

    location /images/ {
        alias /opt/dividendbank/assets/images/;
        add_header Access-Control-Allow-Origin * always;
        try_files $uri =404;
    }
}
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/assets.dividendbank.org /etc/nginx/sites-enabled/assets.dividendbank.org
sudo nginx -t
sudo systemctl reload nginx
```

### 10.6 HTTPS

```bash
sudo certbot --nginx -d assets.dividendbank.org
```

### 10.7 元数据上线前检查

浏览器或 `curl` 必须确认以下地址可访问：

- `https://assets.dividendbank.org/nft/1`
- `https://assets.dividendbank.org/nft/420`
- `https://assets.dividendbank.org/images/001.PNG`
- `https://assets.dividendbank.org/images/420.PNG`

检查点：

- JSON 能直接返回
- 图片能直接打开
- HTTPS 正常
- 没有 301 到错误路径

## 11. 准备前端环境

### 11.1 创建 `web/.env.production`

在：

```bash
/Users/chih/Desktop/testdeploy/web/.env.production
```

先填部署前就能确定的值：

```env
VITE_WALLETCONNECT_PROJECT_ID=你的WalletConnect项目ID
VITE_BSC_RPC_URL=你的BSC主网RPC或公共RPC
VITE_FLAP_TOKEN_ADDRESS=0x1b2884470a5de9a39dc234a20141146de6b67777
VITE_FLAP_DIVIDEND_ADDRESS=0x7BAf5A394183Ff0C3592aD5980Db524CD2e7881E
VITE_ELEMENT_NFT_URL=
VITE_SYSTEM_ACCESS_CONTROL_ADDRESS=
VITE_REFERRAL_REGISTRY_ADDRESS=
VITE_GAME_REGISTRY_ADDRESS=
VITE_GAME_MANAGER_ADDRESS=
VITE_BANKROLL_VAULT_ADDRESS=
VITE_INCOME_POOL_ADDRESS=
VITE_DIVIDEND_BANK_NFT_ADDRESS=
VITE_NFT_REVENUE_DISTRIBUTOR_ADDRESS=
```

### 11.2 为什么先不填全部

因为以下 8 个地址必须等合约部署完成后，从 `deployments/56.json` 回填：

- `VITE_SYSTEM_ACCESS_CONTROL_ADDRESS`
- `VITE_REFERRAL_REGISTRY_ADDRESS`
- `VITE_GAME_REGISTRY_ADDRESS`
- `VITE_GAME_MANAGER_ADDRESS`
- `VITE_BANKROLL_VAULT_ADDRESS`
- `VITE_INCOME_POOL_ADDRESS`
- `VITE_DIVIDEND_BANK_NFT_ADDRESS`
- `VITE_NFT_REVENUE_DISTRIBUTOR_ADDRESS`

## 12. 部署前演练

主网前至少做一次本地检查：

```bash
cd /Users/chih/Desktop/testdeploy
forge test --offline
cd /Users/chih/Desktop/testdeploy/web
npm run build
```

确认：

- Foundry 编译通过
- 前端能正常 build
- 没有类型错误

## 13. 正式部署核心合约

### 13.1 切回项目根目录并导出环境

```bash
cd /Users/chih/Desktop/testdeploy
set -a
source .env.deploy
set +a
```

### 13.2 执行部署

```bash
forge script script/DeployGameFi.s.sol:DeployGameFi --rpc-url $BSC_RPC_URL --broadcast
```

### 13.3 产物位置

部署成功后会写入：

```bash
/Users/chih/Desktop/testdeploy/deployments/56.json
```

因为 BSC Mainnet `chainId = 56`。

### 13.4 立刻备份 3 份信息

- `deployments/56.json`
- 每笔部署交易哈希
- 部署钱包最终 nonce

## 14. 回填链上地址

### 14.1 回填 `.env.deploy`

从 `deployments/56.json` 回填：

```env
SYSTEM_ACCESS_CONTROL=systemAccessControl
GAME_MANAGER=gameManager
BANKROLL_VAULT=bankrollVault
INCOME_POOL=incomePool
DIVIDEND_BANK_NFT=dividendBankNftProxy
NFT_REVENUE_DISTRIBUTOR=nftRevenueDistributor
```

关键提醒：

- `DIVIDEND_BANK_NFT` 必须填 `dividendBankNftProxy`
- 不要填 `dividendBankNftImplementation`

### 14.2 同步回填 `.env.server`

把同样 6 个地址同步到 Debian 12 的：

```bash
/opt/dividendbank/app/.env.server
```

### 14.3 回填 `web/.env.production`

从 `deployments/56.json` 回填：

```env
VITE_SYSTEM_ACCESS_CONTROL_ADDRESS=systemAccessControl
VITE_REFERRAL_REGISTRY_ADDRESS=referralRegistry
VITE_GAME_REGISTRY_ADDRESS=gameRegistry
VITE_GAME_MANAGER_ADDRESS=gameManager
VITE_BANKROLL_VAULT_ADDRESS=bankrollVault
VITE_INCOME_POOL_ADDRESS=incomePool
VITE_DIVIDEND_BANK_NFT_ADDRESS=dividendBankNftProxy
VITE_NFT_REVENUE_DISTRIBUTOR_ADDRESS=nftRevenueDistributor
```

## 15. 配置 Chainlink VRF

### 15.1 合约使用的是 VRF v2 风格接口

[GameManager.sol](/Users/chih/Documents/NFT/分红银行/src/gamefi/manager/GameManager.sol) 使用的是 `IVRFCoordinatorV2Like`，并通过 `setVrfConfig` 设置：

- `coordinator`
- `keyHash`
- `subscriptionId`
- `requestConfirmations`
- `callbackGasLimit`

### 15.2 2026-06-04 我核对到的官方信息

我已核对官方 VRF 订阅页面：

- BNB Chain 主网 VRF 页面：`https://vrf.chain.link/bsc`
- 页面显示的 BNB Chain 主网 VRF Coordinator 为 `0xd691f04bc0C9a24Edb78af9E005Cf85768F694C9`

注意：

- 页面同时展示多条 `Key hash / Max gas price` 组合
- 你实际创建 subscription 时，应当以当日官方页面展示的 gas lane 为准，复制完整 `VRF_KEY_HASH`

### 15.3 创建 VRF subscription

打开：

- [Chainlink VRF BNB 页面](https://vrf.chain.link/bsc)

执行：

1. 连接管理 subscription 的钱包
2. 创建新 subscription
3. 充值足够 LINK
4. 记录 `subscription id`
5. 从官方页面复制你要使用的完整 `keyHash`

### 15.4 回填 `.env.deploy`

至少填：

```env
VRF_COORDINATOR=0xd691f04bc0C9a24Edb78af9E005Cf85768F694C9
VRF_KEY_HASH=从Chainlink官方页面复制的完整值
VRF_SUBSCRIPTION_ID=你的subscription id
VRF_REQUEST_CONFIRMATIONS=3
VRF_CALLBACK_GAS_LIMIT=600000
```

### 15.5 链上写入 VRF 配置

```bash
cd /Users/chih/Desktop/testdeploy
set -a
source .env.deploy
set +a
forge script script/ConfigureVrf.s.sol:ConfigureVrf --rpc-url $BSC_RPC_URL --broadcast
```

### 15.6 把 `GameManager` 加进 consumer

在 Chainlink VRF 界面中，把：

- `GAME_MANAGER`

添加为 subscription consumer。

少这一步，下注会因为 VRF consumer 权限问题失败。

## 16. 首轮注资 `BankrollVault`

### 16.1 为什么必须先注资

不先给 `BankrollVault` 注入 FLAP，游戏虽然部署成功，但用户下注时无法稳定结算。

### 16.2 执行动作

用你们准备用作资金池的钱包，直接向：

- `BANKROLL_VAULT`

转入首轮 FLAP。

### 16.3 验证

至少确认：

- `BankrollVault` 地址已经收到 FLAP
- dApp 读取到可用资金池后再开放真实下注

## 17. 铸造 NFT

### 17.1 先决定 NFT 首次接收地址

根据你们发售方式选择：

- 如果准备由主钱包持有并去 Element 挂单：`NFT_MINT_RECIPIENT=主钱包`
- 如果准备由运营钱包持有并去 Element 挂单：`NFT_MINT_RECIPIENT=运营钱包`

通常建议：

- 直接铸到准备挂售的那个钱包

### 17.2 推荐先小批量试铸

先不要一上来铸 420 张。

先做：

```env
NFT_MINT_RECIPIENT=准备挂售的钱包
NFT_MINT_TOTAL_QUANTITY=5
NFT_MINT_CHUNK_SIZE=5
```

执行：

```bash
cd /Users/chih/Desktop/testdeploy
set -a
source .env.deploy
set +a
forge script script/MintDividendBankNft.s.sol:MintDividendBankNft --rpc-url $BSC_RPC_URL --broadcast
```

### 17.3 检查试铸结果

确认：

- `DIVIDEND_BANK_NFT` 总供应量增加
- 接收钱包收到 NFT
- `tokenURI(1)` 能正确访问
- 钱包能识别 NFT
- Element 能识别合集基础信息

### 17.4 全量铸造

试铸没问题后，再改成：

```env
NFT_MINT_TOTAL_QUANTITY=420
NFT_MINT_CHUNK_SIZE=20
```

如果前面已经试铸了 5 张，那后续补铸数量要按剩余数量计算，不要重复按 420 再跑一次。

### 17.5 分多地址发行的做法

如果你们不是先集中到一个钱包，而是要分别铸给多个地址：

- 每次修改 `NFT_MINT_RECIPIENT`
- 每次修改本次数量
- 分批执行脚本

## 18. 验证 NFT 元数据和版税

### 18.1 元数据

重点检查：

- `tokenURI(1)`
- `tokenURI(420)`
- 对应图片链接
- 名称、描述、图片都正确

### 18.2 是否还能补改

[DividendBankNFT.sol](/Users/chih/Documents/NFT/分红银行/src/gamefi/nft/DividendBankNFT.sol) 提供了：

- `setBaseURI(string)`，需要 `METADATA_ROLE`
- `setDefaultRoyalty(address,uint96)`，需要 `DEFAULT_ADMIN_ROLE`

因为本次 `MULTISIG_ADMIN=主钱包`，所以即使后续交权完成，主钱包仍可：

- 修改 `NFT_BASE_URI`
- 修改版税接收地址和费率

这意味着：

- 元数据域名或路径出错时，不需要重部署 NFT
- 但修改 `baseURI` 仍然是链上交易，需要主钱包操作

## 19. Element 上架

### 19.1 先完成合集识别

使用：

- `DIVIDEND_BANK_NFT` proxy 地址

在 Element 上认领/识别合集。

### 19.2 核查项目展示

至少检查：

- 合集名称是否为 `分红银行财富卡`
- NFT 图像是否正常
- 持有人数量和你当前持仓是否对上
- token 列表能否正确展开

### 19.3 版税核对

链上设置应为：

- receiver：主钱包
- bps：`400`

### 19.4 回填前端购买入口

当 Element 合集页 URL 确定后，回填：

```env
VITE_ELEMENT_NFT_URL=你的Element合集页URL
```

## 20. 部署前端到 Vercel

### 20.1 导入项目

在 Vercel 中导入仓库：

- `nopoor/two`

项目根目录设置为：

```bash
web
```

### 20.2 Vercel Build 设置

- Framework：Vite
- Root Directory：`web`
- Build Command：`npm run build`
- Output Directory：`dist`

### 20.3 生产环境变量

在 Vercel 后台逐项填写 `web/.env.production` 中的所有 `VITE_*` 变量。

### 20.4 正式域名绑定

在 Vercel 后台把：

- `www.dividendbank.org`

绑定到生产环境。

### 20.5 本地构建确认

上线前最后再本地构建一次：

```bash
cd /Users/chih/Desktop/testdeploy/web
npm run build
```

### 20.6 上线后要立即检查的页面

- `/`
- `/play`
- `/nft`
- `/revenue`
- `/referrals`
- 后台管理页

## 21. Debian 12 自动化脚本

### 21.1 每日快照脚本

每天快照使用：

- [RunDailySnapshot.s.sol](/Users/chih/Documents/NFT/分红银行/script/RunDailySnapshot.s.sol)

执行前：

```bash
cd /opt/dividendbank/app
set -a
source .env.server
set +a
```

执行命令：

```bash
forge script script/RunDailySnapshot.s.sol:RunDailySnapshot --rpc-url $BSC_RPC_URL --broadcast
```

### 21.2 推荐封装成 shell 脚本

创建：

```bash
/opt/dividendbank/app/run-daily-snapshot.sh
```

内容：

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/dividendbank/app
set -a
source .env.server
set +a
forge script script/RunDailySnapshot.s.sol:RunDailySnapshot --rpc-url "$BSC_RPC_URL" --broadcast
```

赋权：

```bash
chmod +x /opt/dividendbank/app/run-daily-snapshot.sh
```

### 21.3 cron

编辑：

```bash
crontab -e
```

推荐：

```cron
CRON_TZ=Asia/Shanghai
1 0 * * * /opt/dividendbank/app/run-daily-snapshot.sh >> /opt/dividendbank/logs/daily-snapshot.log 2>&1
```

### 21.4 快照脚本验收

至少人工执行一次并确认：

- 没有 revert
- 当日快照已生成
- 快照 block 正常

## 22. 收益领取和回购

### 22.1 执行脚本

脚本：

- [HarvestAndBuyback.s.sol](/Users/chih/Documents/NFT/分红银行/script/HarvestAndBuyback.s.sol)

命令：

```bash
cd /opt/dividendbank/app
set -a
source .env.server
set +a
forge script script/HarvestAndBuyback.s.sol:HarvestAndBuyback --rpc-url $BSC_RPC_URL --broadcast
```

### 22.2 每次执行前必须更新的字段

```env
BUYBACK_MIN_FLAP_OUT=
```

它必须基于你当时的链上报价更新。

### 22.3 本手册的建议

当前阶段不要把回购脚本做成完全无人值守自动化。

推荐流程：

1. 先人工查看报价
2. 更新 `.env.server` 里的 `BUYBACK_MIN_FLAP_OUT`
3. 手工执行一次
4. 观察链上成交结果

## 23. 主网完整联调顺序

推荐按这个顺序彩排：

1. 部署合约
2. 回填地址
3. 配置 VRF
4. 把 `GameManager` 加进 consumer
5. 注入首轮 FLAP
6. 试铸 5 张 NFT
7. 检查元数据与合集识别
8. 跑一次每日快照
9. 用 NFT 持有钱包测试 `claim`
10. 前端主网环境 build 并上线
11. 用小额资金测试下注
12. 确认 VRF 正常 fulfill
13. 全量铸造
14. Element 挂售
15. 最终交权

## 24. 最终交权

### 24.1 交权前必须全部确认

- 核心合约都已部署成功
- VRF 已配置成功
- `GameManager` 已加为 consumer
- 至少完成一次真实下注联调
- NFT 已可正常识别
- 每日快照至少成功执行一次
- 自动化钱包已能独立执行脚本

### 24.2 执行交权脚本

脚本：

- [FinalizeMultisigHandover.s.sol](/Users/chih/Documents/NFT/分红银行/script/FinalizeMultisigHandover.s.sol)

命令：

```bash
cd /Users/chih/Desktop/testdeploy
set -a
source .env.deploy
set +a
forge script script/FinalizeMultisigHandover.s.sol:FinalizeMultisigHandover --rpc-url $BSC_RPC_URL --broadcast
```

### 24.3 交权后的目标状态

- 代部署钱包不再保留任何系统 admin 权限
- 代部署钱包不再保留 NFT admin/minter/metadata 权限
- 主钱包保留系统最高权限
- 运营钱包保留 operator/revenue/automation 权限

## 25. 上线验收清单

### 25.1 合约侧

- `deployments/56.json` 已生成
- `DIVIDEND_BANK_NFT` 填的是 proxy 地址
- VRF 配置成功
- `GameManager` consumer 已添加
- `BankrollVault` 已注资

### 25.2 NFT 侧

- `tokenURI(1)` 正常
- `tokenURI(420)` 正常
- 图片可访问
- Element 合集可见
- 版税为 `4%`

### 25.3 自动化侧

- Debian 12 已配置 `assets.dividendbank.org`
- HTTPS 正常
- 每日快照 cron 已落地
- 日志文件正常写入
- 运营钱包可独立广播

### 25.4 前端侧

- `www.dividendbank.org` 已切到 Vercel
- 页面能正常打开
- 钱包能连接
- 合约地址全部指向本次主网部署地址
- NFT 页面能跳 Element

## 26. 日常运维动作

### 26.1 每天

- 检查 `daily-snapshot.log`
- 确认当日快照成功
- 检查 VRF subscription 余额

### 26.2 每周

- 观察 `BankrollVault` 余额
- 观察 `IncomePool` 分配情况
- 视市场情况手工执行 `HarvestAndBuyback`

### 26.3 每次变更元数据时

- 先更新 `assets.dividendbank.org`
- 再决定是否需要主钱包调用 `setBaseURI`

## 27. 最终交付给老板的材料

你完成代部署后，建议一次性交付：

- 主网合约地址清单
- `deployments/56.json`
- 部署交易哈希
- VRF subscription id
- 当前使用的 `VRF_COORDINATOR`
- 当前使用的 `VRF_KEY_HASH`
- `www.dividendbank.org` 的 Vercel 项目名
- `assets.dividendbank.org` 的服务器 IP 和 Nginx 站点文件位置
- Debian 12 自动化脚本位置
- cron 配置
- 当前权限分配结果
- 哪个钱包负责日常自动化
- 哪个钱包负责最高权限

## 28. 本次部署最容易出事的 10 个点

1. `DIVIDEND_BANK_NFT` 填成 implementation 而不是 proxy。
2. `NFT_BASE_URI` 写成 `.../nft.json` 或 `.../nft/1.json` 这种错误格式。
3. 角色地址留空，导致 `vm.envAddress(...)` 解析失败。
4. Debian 时区不是 `UTC+8`，快照错过前 10 分钟窗口。
5. 忘了把 `GameManager` 加入 Chainlink VRF consumer。
6. 运营脚本还在用部署钱包私钥，而不是运营钱包私钥。
7. `BUYBACK_MIN_FLAP_OUT` 没更新就执行回购。
8. NFT 还没检查元数据就一次性铸满 420 张。
9. Vercel 生产环境变量没回填最新地址就上线。
10. 还没确认业务正常，就提前执行最终交权。

## 29. 你现在实际执行时的最短路径

如果你要按最稳口径推进，直接照这个顺序做：

1. 先配好 DNS。
2. 在 macOS 准备 `testdeploy/.env.deploy`。
3. 在 Debian 准备 `app/.env.server`、Nginx、HTTPS。
4. 先把图片和元数据部署到 `assets.dividendbank.org`。
5. 本地 `forge test --offline` 和 `web npm run build`。
6. 部署合约并生成 `deployments/56.json`。
7. 回填 `deploy`、`server`、`web` 三份环境。
8. 创建 VRF subscription，配置 VRF，添加 consumer。
9. 注资 `BankrollVault`。
10. 小批量试铸 NFT。
11. 检查元数据、Element、前端。
12. 跑一次快照和一次小额下注联调。
13. 全量铸造并正式上架。
14. 配置 Debian 每日快照 cron。
15. 最后执行交权脚本。

