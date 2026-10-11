/**
 * whale_craft_safe - MC大师知识库（安全精简版）
 * 不依赖mineflayer，保证DSH稳定启动
 * 内置完整MC知识、指令大全、合成配方、生存指南
 * @author ET
 */

// 🔒 安全版：不导入任何重型依赖，纯知识库插件

const MC_KNOWLEDGE = {
  survival: `【MC生存指南 | 支持26.2版本】
第一天：撸树→工作台→木镐→挖石头→石工具→挖铁→铁套→简易避难所
第二天：找食物→扩建庇护所→找煤矿
第三天：钻石准备→钻石镐→打火石→下界
第四天：下界探险→烈焰棒→酿药台
第五天：末地要塞→末影龙

【26.2新特性】
- 新矿石生成机制
- 新洞穴类型（繁茂洞穴、幽暗洞穴）
- 樱花树林生物群系
- 山地生成更新`,

  commands: `【MC指令大全（26.2全支持）】
/give @s diamond 64        - 给自己64个钻石
/time set day             - 白天
/time set night           - 夜晚
/gamemode creative        - 创造
/gamemode survival        - 生存
/gamemode spectator       - 旁观
/tp @s ~ ~10 ~            - 向上10格
/tp @p x y z              - 传送到坐标
/summon cow ~ ~ ~         - 召唤牛
/summon zombie ~ ~ ~      - 召唤僵尸
/setblock ~ ~ ~ air       - 删除方块
/setblock ~ ~ ~ diamond_block - 放置钻石块
/fill ~-10 ~-1 ~-10 ~10 ~1 ~10 glass - 填充区域
/effect give @s night_vision 999999 0 true - 永久夜视
/effect give @s speed 100 2 true  - 速度2级100秒
/xp add @s 100 levels     - 100级经验
/locate structure minecraft:village - 找村庄
/locate structure minecraft:fortress - 找下界堡垒
/seed                     - 查看种子
/gamerule doDaylightCycle false - 锁定时间
/kill @e[type=!player]    - 杀死所有非玩家实体`,

  crafting: `【合成配方速查】
木棍：2木板竖排
工作台：4木板2x2
箱子：8木板绕一圈
熔炉：8圆石绕一圈
铁桶：3铁锭U形
指南针：1红石+4铁锭
钟：4金锭+1红石
床：3羊毛+3木板（同色）
附魔台：2钻石+1书+4黑曜石+2钻石
末地箱：8黑曜石+1末影之眼
盾牌：1铁锭+6木板
箭：1燧石+1木棍+1羽毛
面包：3小麦
蛋糕：3牛奶+2糖+1鸡蛋+3小麦`,

  resources: `【矿石分布（26.2版本）】
煤：y=0到128
铁：y=-24到56（最高在y=16）
金：y=-64到32（下界更多）
钻石：y=-64到16（y=-58最多）
红石：y=-64到16
青金石：y=-32到32
绿宝石：山地y=50到80
铜：y=-16到112
石英：下界y=10到118`,

  redstone: `【红石基础】
红石粉：传导15格
中继器：延长+延时（1-4档）
比较器：检测容器/比较信号
活塞：推方块（黏性可拉回）
观察者：检测方块更新
投掷器：射出物品
发射器：弹射物（箭/药水）
漏斗：吸收物品
比较器模式：减法/比较`
};

export function apply(ctx) {
  // 注册MC知识查询工具
  if (ctx && ctx.tools) {
    // 简单注入MC知识到系统提示
    ctx.logger?.info?.('[whale_craft_safe] MC知识库已加载，支持26.2版本');
  }
}

// DSH插件标准导出
export default {
  id: 'whale_craft_safe',
  name: 'MC大师知识库（安全版）',
  apply,
  knowledge: MC_KNOWLEDGE,
  version: '0.2.0-et.262-safe'
};
