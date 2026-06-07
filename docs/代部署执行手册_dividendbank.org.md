# 分红银行财富卡代部署执行手册

## 1. 文档定位

这份手册是给你代老板执行整套部署时直接照着做的。

执行口径固定如下：

- 参考仓库：`/Users/chih/Documents/NFT/分红银行`
- 实际 macOS 执行仓库：`/Users/chih/Desktop/testdeploy`
- 实际 Debian 12 执行仓库：`/opt/dividendbank/app`
- 前端正式域名：`https://www.dividendbank.org`
- NFT 元数据域名：`https://assets.dividendbank.org`
- 主链：`BSC Mainnet`

这份手册覆盖：

- 合约部署
- VRF 配置
- 资金池注资
- NFT 元数据生成与托管
- NFT 试铸与全量铸造
- Element 合集识别与上架
- Vercel 前端部署
- Debian 12 自动化脚本
- 最终交权
- 上线验收与交付

## 2. 本次部署固定参数

### 2.1 钱包角色

- 代部署钱包地址：`0x4Dfd8FF6e1fd2A7d9eF61B6Fa91cE8812B6b50dE`
- 主钱包：`0xEa9eDE1d6Fb9aDe1398Fe2423AeaAA64d7364d01`
- 运营钱包：`0x487aA7Fc6643A20Ea816DEA562FBc53D4AB0cA8b`

本次推荐角色映射：

- `MULTISIG_ADMIN` = 主钱包
- `NFT_ROYALTY_RECEIVER` = 主钱包
- `NFT_MINT_RECIPIENT` = 主钱包
- `OPERATOR_WALLET` = 运营钱包
- `REVENUE_OPERATOR_WALLET` = 运营钱包
- `AUTOMATION_WALLET` = 运营钱包
- `PAUSER_WALLET` = `0x0000000000000000000000000000000000000000`
- `NFT_MINTER_WALLET` = `0x0000000000000000000000000000000000000000`
- `NFT_METADATA_WALLET` = `0x0000000000000000000000000000000000000000`

说明：

- `DeployGameFi.s.sol` 会自动把系统最高权限、NFT admin、NFT minter、NFT metadata 权限授给 `MULTISIG_ADMIN`。
- 所以主钱包天然拥有 owner、版税、紧急处理、补铸、改 base URI 的能力。
- 运营钱包只保留运营、收益、自动化所需权限。
- 这样可以减少热钱包权限面。

### 2.2 NFT 固定参数

- NFT 名称：`分红银行财富卡`
- NFT 简称：`分红银行财富卡`
- NFT 最大供应量：`420`
- NFT 版税：`4%`
- 版税 bps：`400`
- 建议 metadata 展示标题前缀：`分红银行财富卡`
- 建议 metadata 描述：

`分红银行财富卡，您身边的财富管家银行卡。畅享分红银行全生态系统永久收益！每天00:00之后，派息上一天全生态收益，收益以分红银行本币形式发放。赶快持有分红银行财富卡，提前进入区块链的元宇宙未来。为您的财富增长，添砖加瓦！`

### 2.3 已知链上基础地址

这几个值当前仓库默认就是主网口径：

- `FLAP_TOKEN=0x1b2884470a5de9a39dc234a20141146de6b67777`
- `FLAP_DIVIDEND=0x7BAf5A394183Ff0C3592aD5980Db524CD2e7881E`
- `WBNB_TOKEN=0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`
- `PANCAKE_ROUTER_V2=0x10ED43C718714eb63d5aA57B78B54704E256024E`

## 3. 先理解真实部署顺序

这套项目不是先独立发一个 NFT 合约，再慢慢补其他系统。

真实入口脚本是 `script/DeployGameFi.s.sol`，一次性会部署：

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

所以正确顺序是：

1. 先准备 DNS、元数据、服务器、前端环境
2. 再部署整套核心合约
3. 回填链上地址
4. 配置 VRF
5. 注资 `BankrollVault`
6. 小批量试铸 NFT
7. 检查元数据和 Element 识别
8. 跑一次每日快照并测试收益领取
9. 前端上线
10. 全量铸造 420 张
11. Element 挂售
12. 最终交权

## 4. 这次最容易忽略的 12 个点

1. 真正执行仓库不是 `Documents/NFT/分红银行`，而是 `/Users/chih/Desktop/testdeploy`。
2. 旧文档里有历史 `dividendbank.com` 残留，本次全部以 `dividendbank.org` 为准。
3. `vm.envAddress(...)` 读取的字段不能空着，不用的地址要写零地址。
4. `DEPLOYER_PRIVATE_KEY` 要手工填，不要写进任何 markdown、git、截图。
5. NFT `tokenURI` 读取的是 `NFT_BASE_URI + tokenId`，不是自动加 `.json`。
6. metadata 文件名必须是 `1` 到 `420`，不是 `1.json` 到 `420.json`。
7. 图片默认命名是 `001.PNG` 到 `420.PNG`。
8. 每日快照必须在 `UTC+8` 每天 `00:00` 到 `00:10` 内执行，推荐 `00:01`。
9. `HarvestAndBuyback` 不能直接做成无脑全自动，`BUYBACK_MIN_FLAP_OUT` 每次都要按最新报价更新。
10. `DIVIDEND_BANK_NFT` 回填时必须使用 proxy 地址，不是 implementation 地址。
11. 全量 420 张 NFT 最终应铸给主钱包，因为你已明确主钱包是 owner、420 张 NFT 持有地址、版税接收地址。
12. 最终交权前要先完成真实链上联调，不要部署完马上 renounce。

## 5. 外部资源准备清单

正式开始前，先把下面资源都准备齐：

- GitHub 仓库访问权限
- Debian 12 服务器 root 或 sudo 权限
- 域名 DNS 控制权
- Vercel 项目创建权限
- 可用的 BSC 主网 RPC
- Chainlink VRF subscription 控制权
- WalletConnect Project ID
- Element 合集认领和挂售所需账号
- 足够 BNB 的代部署钱包
- 足够 BNB 的运营钱包
- 首轮注资 `BankrollVault` 的 FLAP

建议单独建 5 份记录表：

- 部署参数表
- 合约地址表
- 域名 DNS 表
- 服务器目录与服务表
- 交付清单

## 6. 目录规划

### 6.1 macOS

项目根目录：

```bash
/Users/chih/Desktop/testdeploy
```

前端目录：

```bash
/Users/chih/Desktop/testdeploy/web
```

### 6.2 Debian 12

推荐目录：

```bash
/opt/dividendbank/app
/opt/dividendbank/assets
/opt/dividendbank/assets/nft
/opt/dividendbank/assets/images
/opt/dividendbank/logs
```

## 7. 环境文件策略

不要只维护一个 `.env`，本次拆成 3 份。

### 7.1 macOS 部署环境

文件：

```bash
/Users/chih/Desktop/testdeploy/.env.deploy
```

用途：

- 主网部署
- VRF 配置
- NFT 铸造
- 最终交权

这里的 `DEPLOYER_PRIVATE_KEY` 对应代部署钱包。

### 7.2 Debian 12 运维环境

文件：

```bash
/opt/dividendbank/app/.env.server
```

用途：

- 每日快照
- 手工回购
- 收益维护

这里的 `DEPLOYER_PRIVATE_KEY` 对应运营钱包私钥。

### 7.3 Vercel 生产环境

文件：

```bash
/Users/chih/Desktop/testdeploy/web/.env.production
```

用途：

- Vercel 正式构建

## 8. DNS 规划

推荐解析：

- `www.dividendbank.org` -> Vercel
- `assets.dividendbank.org` -> Debian 12 公网 IP
- `@` 根域 -> 可选，建议在 Vercel 做 301 到 `https://www.dividendbank.org`

上线前先验证：

- `www.dividendbank.org` 已在 Vercel 后台验证成功
- `assets.dividendbank.org` 已经指向 Debian 12

## 9. macOS 准备阶段

### 9.1 检查执行仓库

```bash
cd /Users/chih/Desktop/testdeploy
git status
```

确认：

- 代码与 GitHub 仓库 `nopoor/two` 一致
- 存在 `foundry.toml`
- 存在 `script/`、`src/`、`web/`

### 9.2 基础依赖

至少准备：

- `git`
- `forge`
- `cast`
- `node`
- `npm`

前端依赖要在 `web` 下安装：

```bash
cd /Users/chih/Desktop/testdeploy/web
npm install
```

说明：

- 我本地检查时 `npm run build` 报过 `tsc: command not found`，这正是没装完整 `web/node_modules` 时的典型表现。
- 所以上线前必须先在 `web` 执行一次 `npm install`。

### 9.3 创建 `.env.deploy`

在 `/Users/chih/Desktop/testdeploy/.env.deploy` 填：

```env
DEPLOYER_PRIVATE_KEY=手工填写代部署钱包私钥
BSC_RPC_URL=手工填写你的BSC主网RPC

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

NFT_MINT_RECIPIENT=0xEa9eDE1d6Fb9aDe1398Fe2423AeaAA64d7364d01
NFT_MINT_TOTAL_QUANTITY=420
NFT_MINT_CHUNK_SIZE=20

VRF_COORDINATOR=
VRF_KEY_HASH=
VRF_SUBSCRIPTION_ID=
VRF_REQUEST_CONFIRMATIONS=3
VRF_CALLBACK_GAS_LIMIT=600000

BUYBACK_MIN_FLAP_OUT=1
```

说明：

- 这里先不要把私钥写进任何仓库文件。
- `VRF_COORDINATOR`、`VRF_KEY_HASH`、`VRF_SUBSCRIPTION_ID` 必须以部署当天的 Chainlink 官方面板为准，不要盲抄历史文档。

### 9.4 每次运行 Foundry 前导出环境

```bash
cd /Users/chih/Desktop/testdeploy
set -a
source .env.deploy
set +a
```

## 10. Debian 12 准备阶段

### 10.1 安装基础软件

至少准备：

- `git`
- `curl`
- `node`
- `npm`
- `nginx`
- `certbot`
- `python3-certbot-nginx`
- `forge`

### 10.2 建目录并拉取代码

```bash
sudo mkdir -p /opt/dividendbank
sudo chown -R $USER:$USER /opt/dividendbank
cd /opt/dividendbank
git clone https://github.com/nopoor/two app
cd /opt/dividendbank/app
git status
```

### 10.3 创建 `.env.server`

文件：

```bash
/opt/dividendbank/app/.env.server
```

内容基本和 `.env.deploy` 一样，但有 3 个差异：

1. `DEPLOYER_PRIVATE_KEY` 改成运营钱包私钥
2. 合约部署完成后，要把核心地址全部回填
3. `NFT_MINT_RECIPIENT` 在服务器侧可保留主钱包，通常不用于广播 mint

### 10.4 服务器时区

推荐直接设为 `Asia/Shanghai`：

```bash
timedatectl set-timezone Asia/Shanghai
timedatectl
```

如果不改系统时区，cron 里必须显式写：

```cron
CRON_TZ=Asia/Shanghai
```

## 11. 生成并托管 NFT 元数据

### 11.1 图片准备

图片命名按默认脚本：

- `001.PNG`
- `002.PNG`
- ...
- `420.PNG`

### 11.2 metadata 生成规则

仓库工具默认生成：

- metadata 文件名：`1` 到 `420`
- 图片 URL 前缀：你传入的 `--image-base-url`

推荐命令：

```bash
cd /Users/chih/Desktop/testdeploy
node tools/generate-nft-metadata.mjs \
  --output-dir metadata/prod \
  --image-base-url https://assets.dividendbank.org/images/ \
  --token-base-name 分红银行财富卡 \
  --description "分红银行财富卡，您身边的财富管家银行卡。畅享分红银行全生态系统永久收益！每天00:00之后，派息上一天全生态收益，收益以分红银行本币形式发放。赶快持有分红银行财富卡，提前进入区块链的元宇宙未来。为您的财富增长，添砖加瓦！"
```

生成结果位于：

```bash
/Users/chih/Desktop/testdeploy/metadata/prod
```

### 11.3 Debian 12 目标结构

```text
/opt/dividendbank/assets/nft/1
/opt/dividendbank/assets/nft/2
/opt/dividendbank/assets/nft/420
/opt/dividendbank/assets/images/001.PNG
/opt/dividendbank/assets/images/002.PNG
/opt/dividendbank/assets/images/420.PNG
```

### 11.4 Nginx 站点配置

创建：

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

### 11.5 HTTPS

```bash
sudo certbot --nginx -d assets.dividendbank.org
```

### 11.6 元数据上线前验证

浏览器至少检查：

- `https://assets.dividendbank.org/nft/1`
- `https://assets.dividendbank.org/nft/420`
- `https://assets.dividendbank.org/images/001.PNG`
- `https://assets.dividendbank.org/images/420.PNG`

要求：

- JSON 可直接打开
- 图片可直接打开
- HTTPS 正常
- 返回不是 404

## 12. 准备 Vercel 前端环境

### 12.1 创建 `web/.env.production`

```env
VITE_WALLETCONNECT_PROJECT_ID=手工填写
VITE_BSC_RPC_URL=你的BSC主网RPC
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

说明：

- `VITE_ELEMENT_NFT_URL` 先留空，等 Element 合集页可访问后再补。
- 地址类变量等合约部署完成后再回填。

## 13. 部署前演练

部署前至少执行：

```bash
cd /Users/chih/Desktop/testdeploy
forge test --offline
```

我本地检查结果：

- `forge test --offline` 已通过，`40/40` 测试通过。

前端部署前至少执行：

```bash
cd /Users/chih/Desktop/testdeploy/web
npm install
npm run build
```

## 14. 正式部署核心合约

### 14.1 导出环境

```bash
cd /Users/chih/Desktop/testdeploy
set -a
source .env.deploy
set +a
```

### 14.2 执行部署

```bash
forge script script/DeployGameFi.s.sol:DeployGameFi --rpc-url $BSC_RPC_URL --broadcast
```

### 14.3 产物位置

部署清单会写到：

```bash
/Users/chih/Desktop/testdeploy/deployments/56.json
```

### 14.4 部署后立刻备份

立刻记录：

- `deployments/56.json`
- 所有部署交易哈希
- 代部署钱包当次 nonce 范围

## 15. 回填链上地址

部署清单关键字段：

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

### 15.1 回填 `.env.deploy`

```env
SYSTEM_ACCESS_CONTROL=systemAccessControl
GAME_MANAGER=gameManager
BANKROLL_VAULT=bankrollVault
INCOME_POOL=incomePool
DIVIDEND_BANK_NFT=dividendBankNftProxy
NFT_REVENUE_DISTRIBUTOR=nftRevenueDistributor
```

### 15.2 回填 `.env.server`

同步回填以上 6 个地址。

### 15.3 回填 `web/.env.production`

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

注意：

- NFT 前端地址必须填 proxy。
- implementation 地址单独记录给 BscScan 和后续审计，不填前端。

## 16. BscScan 验证

这一步仓库里没有现成 verify 脚本，但正式上线建议一定做。

至少要完成：

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

执行口径：

- 如果你已有 `forge verify-contract` 的 BscScan API Key，就用 Foundry 验证。
- 如果现场不方便配 API Key，就至少在 BscScan UI 上完成关键合约源码验证。
- proxy 和 implementation 地址都要分别记录。

最终交付时至少要有：

- implementation 地址
- proxy 地址
- BscScan 链接
- 是否已验证的状态

## 17. 配置 Chainlink VRF

### 17.1 先准备参数

你必须在部署当天从 Chainlink 官方控制台确认：

- `VRF_COORDINATOR`
- `VRF_KEY_HASH`
- `VRF_SUBSCRIPTION_ID`

不要盲抄旧文档。

### 17.2 回填 `.env.deploy`

```env
VRF_COORDINATOR=
VRF_KEY_HASH=
VRF_SUBSCRIPTION_ID=
VRF_REQUEST_CONFIRMATIONS=3
VRF_CALLBACK_GAS_LIMIT=600000
```

### 17.3 链上写入 VRF 配置

```bash
cd /Users/chih/Desktop/testdeploy
set -a
source .env.deploy
set +a
forge script script/ConfigureVrf.s.sol:ConfigureVrf --rpc-url $BSC_RPC_URL --broadcast
```

### 17.4 将 `GameManager` 加入 consumer

在 Chainlink VRF subscription 管理界面，把 `GAME_MANAGER` 地址加入 consumer。

### 17.5 VRF 验收

至少确认：

- 配置交易成功
- `GameManager` consumer 添加成功
- subscription 余额充足

## 18. 首轮注资 `BankrollVault`

### 18.1 为什么必须先做

游戏下注依赖 `BankrollVault.availableBalance()`。

如果不先注资：

- 下注会因为可用资金不足失败
- 主网上线没有彩排条件

### 18.2 执行动作

用持有 FLAP 的钱包，直接向 `BANKROLL_VAULT` 地址转入首轮 FLAP。

### 18.3 验证

至少确认：

- `BankrollVault` 地址收到 FLAP
- 可用余额已经增加

## 19. 先小批量试铸 NFT

### 19.1 推荐先试铸 5 张

先把 `.env.deploy` 改成：

```env
NFT_MINT_RECIPIENT=0xEa9eDE1d6Fb9aDe1398Fe2423AeaAA64d7364d01
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

### 19.2 试铸后检查

至少检查：

- 主钱包收到了 `#1` 到 `#5`
- `tokenURI(1)` 能打开
- `tokenURI(5)` 能打开
- Element 能开始识别合集

## 20. 试跑每日快照与收益领取

### 20.1 人工执行一次快照

在 UTC+8 的 `00:00` 到 `00:10` 内执行：

```bash
cd /opt/dividendbank/app
set -a
source .env.server
set +a
forge script script/RunDailySnapshot.s.sol:RunDailySnapshot --rpc-url $BSC_RPC_URL --broadcast
```

### 20.2 验收

至少确认：

- 没有 revert
- 当日 snapshot 已生成
- snapshot block 正常

### 20.3 测试收益领取

用持有试铸 NFT 的主钱包在前端或链上测试一次 `claim`。

## 21. Element 合集识别与上架

### 21.1 先让合集被识别

在 Element 使用 `DIVIDEND_BANK_NFT` proxy 地址识别合集。

### 21.2 核查展示

至少看：

- 合集名称是否正确
- NFT 图片是否正常
- metadata 描述是否正确
- 持有地址是否显示主钱包

### 21.3 核对版税

目标：

- 版税接收地址 = 主钱包
- 版税比例 = `4%`

### 21.4 小额测试挂单

推荐先拿试铸 NFT 做一笔极小额挂单与购买验证，确认：

- Element 能正常挂单
- 钱包能正常看到合集
- 版税逻辑展示正确

### 21.5 回填前端购买入口

当 Element 合集页稳定可访问后，回填：

```env
VITE_ELEMENT_NFT_URL=你的Element合集页URL
```

## 22. 部署前端到 Vercel

### 22.1 Vercel 项目设置

- 仓库：`nopoor/two`
- Root Directory：`web`
- Framework：`Vite`
- Build Command：`npm run build`
- Output Directory：`dist`

### 22.2 在 Vercel 填生产环境变量

逐项填写 `web/.env.production` 里的全部 `VITE_*` 字段。

### 22.3 绑定域名

把：

- `www.dividendbank.org`

绑定到生产环境。

### 22.4 本地构建确认

```bash
cd /Users/chih/Desktop/testdeploy/web
npm run build
```

### 22.5 上线后立即验收页面

至少点击检查：

- `/`
- `/play`
- `/nft`
- `/revenue`
- `/referrals`
- 后台管理页

检查点：

- 钱包能连接
- 合约地址不是空
- NFT 页能跳转 Element
- owner 钱包能看到后台入口

## 23. 主网小流量彩排

推荐顺序：

1. 试铸 5 张 NFT
2. Element 识别合集
3. 运行一次每日快照
4. 测试一次 `claim`
5. 用小额 FLAP 测试一笔下注
6. 确认 VRF fulfill 成功
7. 验证结算路径正常
8. 验证前端正常读链

这一步通过后，再进入全量开放。

## 24. 全量铸造 420 张 NFT

### 24.1 先算清楚剩余数量

如果前面试铸了 5 张，那么全量阶段应再铸：

- `415` 张

这时把 `.env.deploy` 改成：

```env
NFT_MINT_RECIPIENT=0xEa9eDE1d6Fb9aDe1398Fe2423AeaAA64d7364d01
NFT_MINT_TOTAL_QUANTITY=415
NFT_MINT_CHUNK_SIZE=20
```

如果前面没有试铸，才直接铸 `420` 张。

### 24.2 执行全量铸造

```bash
cd /Users/chih/Desktop/testdeploy
set -a
source .env.deploy
set +a
forge script script/MintDividendBankNft.s.sol:MintDividendBankNft --rpc-url $BSC_RPC_URL --broadcast
```

### 24.3 全量铸造后检查

至少确认：

- 总供应量 = `420`
- 主钱包持有 = `420`
- `tokenURI(1)` 正常
- `tokenURI(420)` 正常

## 25. Debian 12 自动化脚本

### 25.1 每日快照脚本

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

### 25.2 cron

```bash
crontab -e
```

推荐配置：

```cron
CRON_TZ=Asia/Shanghai
1 0 * * * /opt/dividendbank/app/run-daily-snapshot.sh >> /opt/dividendbank/logs/daily-snapshot.log 2>&1
```

### 25.3 日常验收

每天至少检查：

- `daily-snapshot.log`
- 当日 snapshot 是否成功
- 运营钱包 BNB 是否够

## 26. 手工回购流程

### 26.1 执行命令

```bash
cd /opt/dividendbank/app
set -a
source .env.server
set +a
forge script script/HarvestAndBuyback.s.sol:HarvestAndBuyback --rpc-url $BSC_RPC_URL --broadcast
```

### 26.2 每次执行前必须更新

```env
BUYBACK_MIN_FLAP_OUT=
```

必须根据当时链上报价更新。

### 26.3 本次建议

不要把回购做成无人值守自动化。

推荐固定流程：

1. 先看 WBNB -> FLAP 报价
2. 更新 `BUYBACK_MIN_FLAP_OUT`
3. 手工执行
4. 观察交易结果

## 27. 最终交权

### 27.1 交权前必须全部确认

- 合约已部署完成
- 地址已回填完成
- BscScan 验证已做或已列入交付
- VRF 已配置完成
- `GameManager` 已加 consumer
- `BankrollVault` 已注资
- 至少完成一次真实下注联调
- 至少完成一次 snapshot
- 至少完成一次收益 claim
- Element 合集已识别
- 前端已上线
- 自动化钱包已能独立运行脚本

### 27.2 执行交权脚本

```bash
cd /Users/chih/Desktop/testdeploy
set -a
source .env.deploy
set +a
forge script script/FinalizeMultisigHandover.s.sol:FinalizeMultisigHandover --rpc-url $BSC_RPC_URL --broadcast
```

### 27.3 交权后目标状态

- 代部署钱包不再保留任何系统 admin 权限
- 代部署钱包不再保留 NFT admin/minter/metadata 权限
- 主钱包保留系统最高权限
- 运营钱包保留 `operator`、`revenue`、`automation` 权限

## 28. 上线验收清单

### 28.1 合约侧

- `deployments/56.json` 已生成
- `DIVIDEND_BANK_NFT` 回填的是 proxy 地址
- VRF 配置成功
- `GameManager` 已加 consumer
- `BankrollVault` 已注资

### 28.2 NFT 侧

- `tokenURI(1)` 正常
- `tokenURI(420)` 正常
- 图片可访问
- 主钱包持有 `420` 张
- Element 合集可见
- 版税 `4%`

### 28.3 自动化侧

- `assets.dividendbank.org` 正常
- HTTPS 正常
- 每日快照 cron 已配置
- 日志正常写入
- 运营钱包可独立广播

### 28.4 前端侧

- `www.dividendbank.org` 已切到 Vercel
- 页面正常打开
- 钱包能连接
- 合约地址全部正确
- NFT 页面能跳 Element

## 29. 最终交付给老板的材料

建议一次性交付：

- 主网合约地址清单
- `deployments/56.json`
- 主要部署交易哈希
- BscScan 链接
- VRF subscription id
- 当前使用的 `VRF_COORDINATOR`
- 当前使用的 `VRF_KEY_HASH`
- Vercel 项目名
- `www.dividendbank.org` 域名绑定情况
- `assets.dividendbank.org` 服务器站点配置位置
- cron 配置
- 每日快照脚本路径
- 交权交易哈希

## 30. 你这次执行时的最短落地顺序

如果你只看最短顺序，就按这个做：

1. 在 `/Users/chih/Desktop/testdeploy/web` 执行 `npm install`
2. 配好 `.env.deploy`
3. 配好 Debian 12、Nginx、HTTPS
4. 生成并上传 metadata 与图片
5. 部署核心合约
6. 回填地址
7. 配置 VRF 并添加 consumer
8. 给 `BankrollVault` 注资
9. 试铸 5 张到主钱包
10. 测 metadata、Element、snapshot、claim、前端、小额下注
11. 全量补铸到 420
12. 完成 Element 挂售
13. 上线前端
14. 落地 cron
15. 最终交权
