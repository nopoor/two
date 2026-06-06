# 分红银行 dApp 本地预演 SOP

## 目标

这份文档只解决一件事：

- 在**正式部署前**，先本地预演 dApp，确认：
  - `owner` 钱包看到的后台是否符合预期
  - 普通用户看到的游戏入口是否符合预期
  - `owner` 在后台开启盲盒后，普通用户页面是否会同步显示盲盒入口

这次预演的重点是：

- 权限显示
- 后台入口
- 游戏开关
- 普通用户隐藏逻辑

但要注意：

- 即使这轮你只是想测前端显示
- 当前仓库的部署脚本仍然会**一次性部署整套合约**
- 其中包含 `DividendBankNFT`

所以这轮本地预演里，下面这些 NFT 字段依然是**必填项**：

- `NFT_NAME`
- `NFT_SYMBOL`
- `NFT_BASE_URI`
- `NFT_ROYALTY_RECEIVER`
- `NFT_ROYALTY_BPS`

这次预演**先不强求**完整测试：

- VRF 开奖
- 真正下注结算
- NFT 快照
- 回购

如果只是验证“页面和权限逻辑”，按这份文档做就够了。

---

## 结论先说

推荐采用：

- **本地 BSC fork**
- **本地模拟 owner / 运营 / 普通用户钱包**
- **本地部署一套合约**
- **本地跑前端**

原因：

1. 当前前端固定按 `BNB Smart Chain` 的链配置工作。
2. 你可以不碰老板真实钱包。
3. 能非常接近正式主网的显示和权限逻辑。

---

## 你需要准备什么

### 1. 一个可用的 BSC 主网 RPC

例如：

- QuickNode
- Ankr
- Alchemy
- 其他 BSC RPC 服务商

用途：

- 本地 `anvil` fork BSC 主网

### 2. 4 个本地测试钱包

建议角色如下：

- `部署钱包`
  - 你自己本地用来部署
- `本地 owner 钱包`
  - 模拟老板 owner
  - 用来测试后台显示和游戏开关
- `本地运营钱包`
  - 模拟运营/自动化钱包
- `本地普通用户钱包`
  - 用来测试普通玩家视角

注意：

- 这里的 `owner` 钱包是**本地模拟钱包**
- 不是老板真实钱包
- 正式主网部署时，再替换成老板真实地址

### 3. 一个单独浏览器环境

强烈建议：

- 新建一个浏览器 Profile
- 或者用无痕窗口 + 单独钱包插件

原因：

- 这次测试会把钱包连接到本地 RPC
- 不建议用你平时正式用的钱包环境直接做

---

## 第 1 步：启动本地 BSC fork

进入项目目录：

```bash
cd /Users/chih/Documents/NFT/分红银行
```

执行：

```bash
anvil --fork-url 你的BSC主网RPC --chain-id 56
```

例如：

```bash
anvil --fork-url https://bsc-dataseed.binance.org --chain-id 56
```

这一步为什么要 `chain-id 56`：

- 当前前端链配置固定是 BSC 主网
- 如果本地链 ID 不是 `56`，前端钱包接入会不顺

看到本地节点监听：

- `http://127.0.0.1:8545`

就说明成功。

---

## 第 2 步：准备预演用环境变量

不要直接改正式 `.env`。

建议单独准备两份：

- `/Users/chih/Documents/NFT/分红银行/.env.preview`
- `/Users/chih/Documents/NFT/分红银行/web/.env.preview`

---

## 第 3 步：写合约预演配置

在：

- `/Users/chih/Documents/NFT/分红银行/.env.preview`

填下面这份模板：

```env
DEPLOYER_PRIVATE_KEY=
BSC_RPC_URL=http://127.0.0.1:8545

FLAP_TOKEN=0x1b2884470a5de9a39dc234a20141146de6b67777
FLAP_DIVIDEND=0x7BAf5A394183Ff0C3592aD5980Db524CD2e7881E
WBNB_TOKEN=0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
PANCAKE_ROUTER_V2=0x10ED43C718714eb63d5aA57B78B54704E256024E

NFT_NAME=Dividend Bank Genesis
NFT_SYMBOL=DBANK
NFT_BASE_URI=https://preview.example.com/metadata/
NFT_ROYALTY_RECEIVER=
NFT_ROYALTY_BPS=400

MULTISIG_ADMIN=
OPERATOR_WALLET=
PAUSER_WALLET=
REVENUE_OPERATOR_WALLET=
AUTOMATION_WALLET=
NFT_MINTER_WALLET=
NFT_METADATA_WALLET=

SYSTEM_ACCESS_CONTROL=
GAME_MANAGER=
BANKROLL_VAULT=
INCOME_POOL=
DIVIDEND_BANK_NFT=
NFT_REVENUE_DISTRIBUTOR=

NFT_MINT_RECIPIENT=
NFT_MINT_TOTAL_QUANTITY=20
NFT_MINT_CHUNK_SIZE=10

VRF_COORDINATOR=
VRF_KEY_HASH=
VRF_SUBSCRIPTION_ID=
VRF_REQUEST_CONFIRMATIONS=3
VRF_CALLBACK_GAS_LIMIT=600000

BUYBACK_MIN_FLAP_OUT=1
```

### 这些字段怎么填

先说最容易踩坑的一点：

- 这几个 NFT 字段虽然只是给本地预演用
- 但**不能留空**
- 否则部署脚本会直接在 `vm.envString(...)` / `vm.envAddress(...)` 这里报错

如果你只是做本地预演，可以先这样填一套占位值：

```env
NFT_NAME=Dividend Bank Genesis Preview
NFT_SYMBOL=DBP
NFT_BASE_URI=https://preview.example.com/metadata/
NFT_ROYALTY_RECEIVER=本地owner钱包地址
NFT_ROYALTY_BPS=400
```

- `DEPLOYER_PRIVATE_KEY`
  - 填本地部署钱包私钥
  - 建议带 `0x`

- `MULTISIG_ADMIN`
  - 填本地 owner 钱包地址

- `NFT_ROYALTY_RECEIVER`
  - 也填本地 owner 钱包地址

- `PAUSER_WALLET`
  - 建议也填本地 owner 钱包地址

- `NFT_MINTER_WALLET`
  - 建议也填本地 owner 钱包地址

- `NFT_METADATA_WALLET`
  - 建议也填本地 owner 钱包地址

- `OPERATOR_WALLET`
  - 填本地运营钱包地址

- `REVENUE_OPERATOR_WALLET`
  - 也填本地运营钱包地址

- `AUTOMATION_WALLET`
  - 也填本地运营钱包地址

### 这一步先不要纠结 VRF

如果这次你只测：

- 后台可见性
- 普通用户显示
- 盲盒开关

那这轮可以先不测完整开奖链路。

也就是说：

- `VRF_COORDINATOR`
- `VRF_KEY_HASH`
- `VRF_SUBSCRIPTION_ID`

这几个先留空也没关系，只要你这轮不去跑完整下注开奖。

---

## 第 4 步：写前端预演配置

在：

- `/Users/chih/Documents/NFT/分红银行/web/.env.preview`

填下面这份：

```env
VITE_WALLETCONNECT_PROJECT_ID=
VITE_BSC_RPC_URL=http://127.0.0.1:8545

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

现在先填：

- `VITE_WALLETCONNECT_PROJECT_ID`
- `VITE_BSC_RPC_URL`

后面的合约地址，等部署完成后再回填。

---

## 第 5 步：部署本地预演合约

进入目录：

```bash
cd /Users/chih/Documents/NFT/分红银行
```

把预演配置临时切到正式文件名：

```bash
cp .env.preview .env
```

然后把 `.env` 里的字段导出到当前 shell：

```bash
set -a
source .env
set +a
```

注意：

- `forge` 的 `vm.envString(...)`、`vm.envAddress(...)`、`vm.envUint(...)`
- 读取的是**当前进程环境变量**
- 不是单纯读取你磁盘上的 `.env` 文件内容

所以：

- 只执行 `cp .env.preview .env` 还不够
- 必须再 `source` 并导出一次

执行部署：

```bash
forge script script/DeployGameFi.s.sol:DeployGameFi --rpc-url http://127.0.0.1:8545 --broadcast
```

部署成功后，会生成：

- `/Users/chih/Documents/NFT/分红银行/deployments/56.json`

---

## 第 6 步：把部署地址回填到前端

打开：

- `/Users/chih/Documents/NFT/分红银行/deployments/56.json`

把这些字段回填进：

- `/Users/chih/Documents/NFT/分红银行/web/.env.preview`

需要回填的是：

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

其中注意：

- `VITE_DIVIDEND_BANK_NFT_ADDRESS`
  - 要填 `dividendBankNftProxy`
  - 不是 implementation

---

## 第 7 步：启动前端

进入前端目录：

```bash
cd /Users/chih/Documents/NFT/分红银行/web
```

把预演配置切成当前 `.env`：

```bash
cp .env.preview .env
```

启动：

```bash
npm run dev
```

正常情况下会看到类似：

- `http://localhost:5173`

---

## 第 8 步：配置钱包网络

这是整个预演里**最重要的一步**。

### 前端读链和钱包发交易不是一回事

即使你前端配置了：

- `VITE_BSC_RPC_URL=http://127.0.0.1:8545`

也只代表：

- 页面读取链上数据时，优先走本地 RPC

但是：

- 你点击后台按钮发交易时
- 真正签名和广播，是钱包自己的网络设置决定的

### 所以必须保证

测试用钱包当前连接的 BSC 网络 RPC，也要指向：

- `http://127.0.0.1:8545`

### 强烈建议

不要动你平时正式使用的钱包环境。

请用：

- 单独浏览器 Profile
- 单独钱包插件环境
- 或者一套专门测试的钱包

避免误把正式 BSC RPC 改成本地。

---

## 第 9 步：按两个视角测试

建议同时开两个浏览器窗口：

1. `owner` 视角窗口
2. 普通用户视角窗口

最方便的方式：

- 一个正常窗口连本地 owner 钱包
- 一个无痕窗口连本地普通用户钱包

都打开：

- `http://localhost:5173`

---

## 第 10 步：你应该看到什么

### 场景 A：普通用户视角

用普通用户钱包连接后，检查：

1. 看不到管理中心入口
2. 进入 `/play`
3. 只看到：
   - 飞船模式
4. 看不到：
   - 盲盒模式

这是因为当前部署脚本默认状态是：

- 飞船开启
- 盲盒关闭

---

### 场景 B：owner 视角

用本地 owner 钱包连接后，检查：

1. 能看到管理中心入口
2. 能进入：

```text
/admin
```

3. 在后台“游戏上线控制”区域，应该看到：
   - 飞船模式：已上线
   - 盲盒模式：未上线

4. 当前地址如果是你填的 `MULTISIG_ADMIN`，应具备后台控制能力

---

### 场景 C：owner 后台开启盲盒

在 owner 窗口：

1. 进入 `/admin`
2. 找到盲盒模式
3. 点击：
   - `上线此游戏`

交易成功后：

1. 普通用户窗口刷新 `/play`
2. 此时应该能看到：
   - 飞船模式
   - 盲盒模式

这说明：

- 后台链上开关
- 前台用户可见性

已经联动成功。

---

### 场景 D：owner 再关闭盲盒

在 owner 窗口后台：

1. 把盲盒再次关闭

然后普通用户窗口刷新 `/play`：

1. 盲盒入口应再次消失

这说明：

- 普通用户显示确实跟链上状态同步

---

## 这轮测试结束后，你可以确认什么

如果上面都正常，就说明以下逻辑符合预期：

1. owner 钱包能看到后台
2. 普通用户看不到后台
3. 默认首发只有飞船
4. 未上线盲盒对普通用户隐藏
5. owner 能在后台手动上线盲盒
6. 上线后普通用户页面会同步显示

---

## 这轮测试先不用做什么

这一轮先不建议折腾：

- 真正下注并自动开奖
- VRF 返回
- NFT 快照执行
- 回购脚本
- 首发挂单

因为这些需要你再补：

- 资金
- VRF
- 更完整链上状态

先把“页面逻辑 + 权限逻辑”跑通，效率最高。

---

## 常见问题

### 1. 页面能打开，但点后台按钮没反应

优先检查：

- 钱包是不是连到了本地 fork RPC
- 不是只看前端 `.env`

很多时候页面读的是本地链，但钱包签名发的是另一条链。

### 2. 普通用户还能看到盲盒

优先检查：

- owner 是否真的把盲盒关掉了
- 页面是否刷新了
- 前端是不是回填了正确的 `VITE_GAME_REGISTRY_ADDRESS`

### 3. `/admin` 进不去

优先检查：

- 当前连接的钱包是不是你填进 `MULTISIG_ADMIN` 的那个本地 owner 钱包

### 4. 不想覆盖正式 `.env`

那就每次执行前手动：

```bash
cp .env.preview .env
cp /Users/chih/Documents/NFT/分红银行/web/.env.preview /Users/chih/Documents/NFT/分红银行/web/.env
```

测试完再换回正式配置。

---

## 最后的建议

最推荐你这样操作：

1. 起本地 fork
2. 部署本地预演合约
3. 启前端
4. 一个窗口连本地 owner
5. 一个窗口连本地普通用户
6. 在后台开关盲盒，观察普通用户页面是否同步变化

如果这一步通过，就说明你这次最关心的 dApp 显示逻辑已经基本稳了。
