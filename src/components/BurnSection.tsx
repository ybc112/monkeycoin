import { Flame, TimerReset, Layers, Zap, Globe2 } from "lucide-react";

const STEPS = [
  {
    icon: TimerReset,
    title: "定时触发",
    desc: "达到燃烧间隔（默认 3600 秒 = 1 小时）后，任何人、机器人或普通转账都能推动下一次单边燃烧。",
  },
  {
    icon: Layers,
    title: "抽取本币",
    desc: "Token 合约从主 Pair 的本币储备中按比例转出 $MKY（默认每次 0.5%，上限 1%）到黑洞地址。",
  },
  {
    icon: Zap,
    title: "同步储备",
    desc: "合约调用 Pair.sync() 同步储备量，池内资产比例发生改变，价格即时上移。",
  },
  {
    icon: Globe2,
    title: "公开执行",
    desc: "燃烧函数任何人可调用，不依赖项目方服务器私钥，社区可共同推动通缩。",
  },
];

export default function BurnSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-6">
      <div className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-gradient-to-br from-[#4a150b] to-[#7a2a12] p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-orange-500/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-12 left-1/3 h-40 w-40 rounded-full bg-[var(--sb-gold)]/20 blur-2xl" />

        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f05a32] shadow-lg shadow-orange-900/40">
              <Flame className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-xl font-black sm:text-2xl">LP 单边燃烧 <span className="ml-2 rounded-md bg-orange-200/20 px-2 py-0.5 text-[10px] font-bold text-orange-200">ONE-SIDED BURN</span></h2>
              <p className="text-sm text-orange-100/80">只烧池内本币一侧，不碰 BNB，把每一枚 $MKY 都变成向上的推力</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <div key={step.title} className="relative rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur transition hover:border-orange-300/40">
                <span className="absolute right-3 top-3 text-2xl font-black text-orange-300/30">{index + 1}</span>
                <step.icon className="h-5 w-5 text-[#ffb38a]" />
                <h3 className="mt-3 font-bold">{step.title}</h3>
                <p className="mt-1 text-xs leading-5 text-orange-100/70">{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "燃烧间隔", value: "3600s" },
              { label: "每次比例", value: "0.5%" },
              { label: "单次上限", value: "1%" },
              { label: "执行方式", value: "公开" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-center">
                <div className="text-xs text-orange-100/70">{item.label}</div>
                <div className="mt-1 text-lg font-black text-[#ffd9c0]">{item.value}</div>
              </div>
            ))}
          </div>

          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-orange-100/60">
            <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#ffb38a]" />
            与「交易燃烧」的区别：交易燃烧发生在每笔买卖扣税时直接销毁本币；单边燃烧则是从池子的本币储备中抽取销毁并同步储备，两者独立叠加，共同推动长期通缩。
          </p>
        </div>
      </div>
    </section>
  );
}
