# 自动刷符文：交接文档

这份文档交给下一次会话（在 clyczar 自己的电脑上）接着做。写于 2026-11-12。
前面的对话记录不会跟过去，需要的背景都写在这里。

## 1. 用户和游戏设置

- 平台：**Nintendo Switch 2**，D2R **Reign of the Warlock**，离线单机，玩的时候开飞行模式。
- 角色：Sorceress，83 级。Softcore 还是 Hardcore **还没确认**，做死亡处理之前先问清楚。如果是 Hardcore，不要让机器人去跑。
- 地图：固定的，LK 传送点附近有 **6 个超级宝箱**，旁边有 **2 个篝火**。当前地图的 **RoF 没有超级宝箱**，所以只能刷 LK。LK 的掉落表里没有 Jah 和 Cham。
- 习惯：每局都从 Act 1 开始；佣兵死掉；Terror Zone 关闭；记录数据时关掉自动捡金币和掉落过滤。
- 每局流程：A1 开局 → 打开 Gheed 的赌博窗口读种子 → 传送到 Act 4 RoF 等待 → 传送到 LK → 开箱 → 传送回 **A1 营地** → 存档退出。必须回到 A1 再退出，下一局才会从 A1 开局，才能见到 Gheed。
- 储物箱：必须站在 A1 的储物箱旁边**打开储物箱**，再在背包里的符文上按 **X**，符文会进入专门的符文分页。
- 上锁的箱子要用钥匙打开，每次消耗一把。规划里标了 `needsLock` 的目标，箱子必须是上锁的才会掉。

## 2. 仓库和站点现状

- 本仓库是 `clyczar/D2-SCP`，从 `lozzajp/D2-SCP` fork 过来。`origin` 指向 fork，`upstream` 指向原作者的仓库。
- 推送到 main 后，GitHub Pages 会自动部署到 https://clyczar.github.io/D2-SCP/ 。`docs/` 目录和 `*.md` 文件的改动不会触发部署。
- 提交 bbe672e 新增了 **WebGPU 搜种子**：
  - `src/search/gpu/windowMatcher.wgsl`：把 `WindowMatcher` 移植成 compute shader。WGSL 没有 u64，32×32→64 位乘法拆成 16 位来算。
  - `src/search/gpu/gpuMatcher.ts`：负责调度 GPU，每 8 个 chunk（2^24 个种子一个）读回一次结果，方便中途显示和提前停止。
  - `SeedSearch` 在浏览器支持 WebGPU 时自动用 GPU，否则退回 CPU worker。`backend` 字段记录实际用的是哪个。
  - `gpu-bench.html`：先和 CPU 匹配器逐个比对结果，再测一遍完整 2^32 的搜索速度。
- 实测完整搜一遍 2^32：iPhone 15 Pro 1084M/s（4 秒）；Intel Xe-LPG 核显 2185M/s（2 秒）。两边结果和 CPU 完全一致。RTX 5070 还没测过。
- 2026-11-12 在公司电脑上先做好的、不需要硬件的部分：
  - **Stats 页面**（`#/stats`）：偏差散点图、最近 N 局命中率和误差趋势、偏差分布、用等待时间拟合 fire rate。数据来自 `src/stats/runLog.ts`，可以导入用户手记的 opening history 格式。Refine 页面查出抽取次数后会自动记一笔。
  - **Live 页面**（`#/live`）：显示采集卡画面，在 Worker 里用 `MediaStreamTrackProcessor` 读帧，标签页切到后台也不停。用电脑摄像头测过，正常。
  - **截图接口**（`scripts/viteBotBridge.ts`，只在 dev server 上有）：请求 `GET /__bot/snap?width=640&crop=x,y,w,h`，会把 Live 页面的最新一帧存到 `captures/latest.png`。
  - **硬盘备份**：dev server 上，进度和运行记录会自动备份到 `local-data/*.json`。浏览器存储为空时会从这里恢复，所以换电脑时把这个文件夹拷过去就行。
  - **"Best value first" 排序**（`src/chest/tolerance.ts`）：按用户自己的落点误差分布，算出 6 个箱子期望能拿到多少 Ber 当量、每小时多少。每个箱子间隔 4 次抽取，上锁概率 21%，每局额外耗时 100 秒。
- `vite.config.ts` 把 dev server 固定在 **5290** 端口，preview 在 5291，都开了 `strictPort`，避免和用户工作用的 5173 冲突。以后向原作者提 PR 时，不要带上这个端口改动。

## 3. 数据分析结论

数据来源：用户导出的 `d2scp-lk-route-samples-2026-11-12.json` 和 `d2r_lk_d2scp_opening_history_2026-11-12.json`，在 Downloads 文件夹里，要用户手动拷过来，不在仓库里。

- 校准（LK）：Direct 测了 6 次，分别是 48、49、49、54、56、56，平均 **52.0**。RoF 路线测了 4 次，分别是 98、103、112、113，平均 **106.5**。
- 把所有定向开箱的局、120 秒等待测试和 RoF 基准放在一起做线性拟合：**实际抽取次数 ≈ 105 + 1.55 × 等待秒数**。fire rate = **1.55 ± 0.03**，所以一直用的 1.5625 本身没问题。之前单独测出的 1.611 偏高。
- 拟合后的残差标准差大约是 **5 到 10 次抽取**，而且**和等待多久无关**：两局都等 23.7 秒，结果一局 −9、一局 +4。所以打不中的原因不是 fire rate，也不是计时，而是每局路线本身的随机波动。可能来自加载时间，也可能来自走位，这一点还没查清。
- 按这个误差，正好打中目标抽取的概率大约是 5–8%。用户定向开箱 10 次中了 2 次（Ohm 和 Ist），和这个概率相符。普通测试里平均偏早大约 4 次。
- T05 那局：第一箱在第 317 次抽取，第二箱在第 321 次，**两个箱子之间大约隔 4 次**。第二箱正好打中目标。

### 掉落表统计（65534 个宝箱种子里，能开出对应符文或更高的种子数）

| 表 | ≥Ohm | ≥Lo | ≥Ber | Sur（只算 Sur） |
|---|---|---|---|---|
| LK p5 | 15–17 | 13–15 | 4 | 5 |
| LK p7 | 18 | 13 | 2 | 9 |
| RoF p7 上锁 | 25 | 16 | 7（其中 Jah 3，Cham 1） | – |

- 方块合成：从 Pul 往上都是 **2 个合 1 个，再加一颗宝石**。例如 2 Sur + Flawless Amethyst = Ber。高级配方能不能在离线模式用，还要在游戏里实际试一次确认。
- 按"Ber 当量"来挑目标（Sur 算 0.5 个 Ber，Lo 算 0.25 个）：LK p7 比只瞄 Ber **多出约 30%**，p5 基本没差别。目标放宽到 Sur 以后，最划算的等待上限从 16–22 分钟降到 **10 分钟左右**。再加上 Lo 及以下就没有额外收益了。
- 最长等待时间的模型：每局准备时间为 O、目标密度为 d，最优等待上限 ≈ √(2·O / (1.55·d))。
  - Pul+：约 4 分钟。用户现在"3 分钟内没有目标就重开"，对中级符文是合适的。
  - Ber：约 13 分钟（O = 30 秒）到 25 分钟（O = 75 秒）。
- 自动化之后，每局准备时间估计能降到 **30–40 秒**。游戏本身的加载时间省不掉。
- 这些数字可以用 `docs/analysis/` 里的脚本重新算：`rune-odds.mjs`（各表的符文种子数）、`ber-equivalents.mjs`（Ber 当量和每小时产量）、`fire-rate-fit.mjs`（fire rate 拟合，数据直接写在脚本里）。

## 4. 硬件（用户 2026-11-12 去买）

- 采集卡：**Jaycar XC4680**。UVC 免驱，带 HDMI loop-out 直通，USB 3.0 输出 1080p。盒子里只有一根 USB-A 对 A 的线，HDMI 线要另外买。NS2 的电视输出分辨率要设成 1080p。
- 单片机：**ESP32-S3-DevKitC-1 N16R8**，原包装，排针没焊。它有**两个 USB-C 口**：原生 USB/OTG 口接 NS2 底座；CH343P 转串口的 COM 口接电脑。
  - XIAO 那种只有一个口的 ESP32-S3（比如 Jaycar XC5104）不能用。
  - 固件按 Pokémon Automation 的 **Wired (ESP32-S3) Tutorial** 来，手柄类型选 **"NS2: Wired Controller"**。https://pokemonautomation.github.io/SetupGuide/
- 线材：苹果的 C 对 C 线接电脑；另买一根 USB-C 转 USB-A 的数据线接 NS2 底座。
- 电脑：i5-12400F（没有核显）+ RTX 5070。采集卡插机箱背面的 USB 3.0 口。用户在这台电脑上有管理员权限。
- 风险：用第三方设备模拟手柄违反任天堂的使用条款。已经告诉过用户，用户决定在飞行模式下用。

## 5. 架构方案

运行时完全不需要 LLM，只用传统的图像处理。

- **浏览器页面当中心**，基于 D2-SCP 的 dev server，用 Chrome：
  - `getUserMedia` 读采集卡画面
  - **Web Serial** 控制 ESP32
  - WebGPU 搜种子
- **dev server 开放本地接口**，让 Claude 在开发时能操作：比如截一帧并保存成 PNG、发送一个手柄动作、读取当前状态。截图要缩小或者只截需要的区域，节省 Claude 的用量。用户用的是 Pro 套餐。
- **页面不在前台时不能停**：用户会把显示器切到 NS2 的输入去看，或者让页面在后台运行。Chrome 会对隐藏的标签页降低 `requestAnimationFrame` 和定时器的执行频率，所以抓帧和控制循环要放到 Worker 里跑（例如用 `MediaStreamTrackProcessor`），不能依赖 rAF。建议用户用显示器自带的输入切换，不要用 KVM，因为 KVM 切走后，Windows 会认为显示器断开了。电脑的睡眠要关掉。
- **识别方法**：
  - 赌博窗口是 10×10 的格子，用**模板匹配**认物品图标。模板可以由 Claude 直接看截图来标注，也可以在用户手动输入物品时自动截存。
  - 当前处于哪个画面（加载中、传送点菜单、储物箱等），用固定区域的颜色来判断。
  - 地上物品的名字用 OCR。可以用 tesseract.js；符文是橙色字，先按颜色筛一遍。
  - 血球低于阈值时，用读像素的方式判断，然后马上存档退出（chicken）。
- **每局的状态机**：
  1. 在 A1 读赌博窗口，用 GPU 搜出种子
  2. 规划目标（按容错率，Sur 和 Ber 都算）
  3. 去 RoF 等待，以采集卡画面上真正落地的那一帧为计时起点
  4. 去 LK，按固定动作走，每一步看画面确认
  5. 开箱，读掉落，反查实际是第几次抽取，记录下来
  6. 捡 ≥ 门槛的符文
  7. 6 个箱子都开
  8. 回 A1 → 打开储物箱 → 按 X 放符文 → 补钥匙 → 存档退出
- **在线校准**：每局开第一箱后都会知道实际的抽取次数，用最近几百局的数据持续重新拟合 Direct/RoF 平均值、fire rate 和误差分布；明显不对的局（读错、被打断）自动排除。
- **第一箱后修正**：第一箱比目标早的话，用后面几个箱子去补。可以测试一个想法：**LK 的篝火会不会像 RoF 的火一样随时间消耗抽取？** 如果会，开完第一箱后就可以站在篝火旁边等几秒，精确补齐差距。用户懒得手动测，让机器人自己跑这个实验（开第一箱，等 60 秒，开第二箱，比较两箱之间的抽取差）。
- **统计面板**（用户要求能看到准确率有没有上升）：每局结束后自动更新，数据存在本地，可以一键导出。包括：
  - 每局偏差散点图（实际 − 目标）
  - 最近 50 局的命中率和偏差标准差趋势
  - 偏差分布直方图，以及平均偏早或偏晚多少
  - 偏差和 RoF 停留时间、加载时间、走路时间的关系，用来找误差来源
  - 累计产量（换算成 Ber 当量）、每小时产量、"凑够 N 个 Ber 还要多久"
  - fire rate 和路线平均值随时间的变化
  - 手动阶段的数据也要记，这样自动化前后可以直接对比
- **界面**：选一个目标符文，或者选"Ber（含合成）"按 Ber 当量来挑；最长等待时间自动计算；可以设置"刷到几个就停"；实时显示统计和预计出货时间。

## 6. 分阶段计划

1. **采集卡**：在页面里显示画面，自动读赌博窗口，按帧记录每局数据。这一阶段用户自己用手柄玩，并用 1/60 秒精度的数据弄清误差到底从哪来。
2. **ESP32**：刷好固件，让 NS2 认出手柄；先做简单的自动操作，比如存档退出、开新游戏、打开赌博窗口。
3. **跑完整一局**：路线、开箱、读掉落、捡符文、放储物箱、补钥匙、处理意外。
4. 不需要硬件的改进可以随时做：按容错率规划、Ber 当量目标、每个符文单独的等待上限。
5. **第二个角色专刷 RoF**（用户 2026-11-12 提出）：
   - 新角色需要 Hell 难度、Act 4 的 RoF 传送点，地图上 RoF 传送点附近要有超级宝箱。
   - RoF 路线：A1 → RoF 等待 → 直接去开 RoF 的箱子，不用再去 LK。少了一次传送和加载，误差可能更小。RoF 的表有更多 Ber 以上的目标，还能出 Jah 和 Cham。
   - 系统按**角色档案**来组织：每个角色单独保存人物等级、校准数据、路线脚本、地标模板和目标表；识别、菜单、储物箱、死亡处理、ESP32 控制这些都共用。
   - 角色档案已经做好（`src/app/profiles.ts`，2026-11-12）：在设置菜单的 "Character" 里新建或切换角色。默认角色叫 "Main"，用原来的存储键；其他角色的键后面加 `@<名字>`，进度和运行记录都分开保存，硬盘备份文件名带 `-p-<slug>`。重置和删除只影响当前角色。
   - 只有一台 NS2，同一时间只能跑一个角色。可以手动换，也可以让机器人自己在角色选择界面切换。

## 7. 还没解决的问题

- 角色是 Softcore 还是 Hardcore？
- A1 营地里谁卖钥匙？一组钥匙最多叠几把？
- Pul 以上的符文合成，离线模式能不能用？
- ~~Pokémon Automation 的 ESP32 固件用什么串口协议？~~ 2026-11-12 查过：
  - 协议叫 **PABotBase2**。源码在 `PokemonAutomation/Arduino-Source`（**MIT 许可证**），可以移植成 TypeScript，用 Web Serial 直接驱动。固件的二进制文件从 `PokemonAutomation/ComputerControl` 的 releases 下载，文件名是 `PABotBase2-ESP32-<版本>.bin`。这个仓库没有写许可证，个人使用没问题。旧协议 PABotBase1 已经不兼容。
  - 协议分三层：
    - **Packet 层**：每个包有 magic `0x81`、seqnum、长度、opcode，带校验和重传。`Common/PABotBase2/ReliableConnectionLayer/` 一共大约 1700 行 C++，参考 `PABotBase2CC_ReliableStreamConnection.cpp`、`PacketParser`、`PacketSender`、`StreamCoalescer`。
    - **Message 层**：`PABotBase2_MessageProtocol.h`，消息头是 u16 长度 + opcode + id。用到的 opcode：`0x20/0x21` 查协议版本和固件版本，`0x24` 查控制器列表，`0x32/0x33` 读取和切换控制器模式，`0x43` 表示指令执行完了。
    - **手柄指令**：`0x90 PABB2_MESSAGE_CMD_NS_WIRED_CONTROLLER_STATE`，内容是 u16 毫秒数 + 7 字节手柄状态（buttons0、buttons1、dpad、左摇杆 x/y、右摇杆 x/y，见 `Common/ControllerStates/NintendoSwitch_WiredController_State.h`）。上位机那边的写法参考 `SerialPrograms/Source/NintendoSwitch/Controllers/PABotBase2/NintendoSwitch_PABotBase2_WiredController.cpp`。
  - 协议版本号（目前是 packet `2026061800`、message `2026061806`）会随固件更新而变。**选定一个固件版本后，按那个版本对应的源码来移植**，以后不要随便升级固件。
  - 固件开机默认是 "NS1: Wired Pro Controller"。NS2 可能要先用 `0x33` 切到 NS2 有线手柄模式，要实测确认。
  - **建议顺序**：先只用官方的 ComputerControl 程序确认 NS2 能认出 ESP32，并且能手动按键，不写任何代码；确认没问题后，再移植 packet、message 和 0x90 指令这几部分。
- NS2 上 ESP32 有线手柄的稳定性如何，摇杆灵敏度怎么设？
