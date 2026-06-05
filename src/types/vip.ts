/**
 * VIP 系统类型声明（FEAT-300 引入，FEAT-306 消费）。
 *
 * 只声明签到快照形状；签到逻辑、每日倍率、彩虹殿堂解锁在 VipSystem 实现。
 * 注：玩家的 `isVip: boolean` 仍由 PlayerSaveV3.isVip 承载（兼容 v1/v2 迁移）；
 * 本结构只描述"签到连续天数等附加 VIP 状态"，与 `isVip` 正交共存。
 */

/**
 * VIP 签到快照。持久化到 PlayerSaveV3.vip。
 *
 * - `lastCheckinDate`：最近一次签到日期（UTC 的 YYYY-MM-DD 字符串，null 表示从未签到）。
 *   字符串而不是时间戳，是为了跨时区展示稳定、调试友好。
 * - `checkinStreak`：连续签到天数。跨日未签到会由 VipSystem 纯函数重置为 0。
 */
export interface VipSnapshot {
  readonly lastCheckinDate: string | null;
  readonly checkinStreak: number;
}
