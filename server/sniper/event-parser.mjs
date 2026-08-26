// Flap Portal 事件解析：日志 → 归一化业务事件
import { id } from "ethers";
import { PORTAL_ABI, quoteTokenLabel, fromQuote, fromToken } from "./flap-contracts.mjs";

const iface = new (await import("ethers")).Interface(PORTAL_ABI);

export const EVENT_TOPICS = {
  TOKEN_CREATED: iface.getEvent("TokenCreated").topicHash,
  TOKEN_BOUGHT: iface.getEvent("TokenBought").topicHash,
  TOKEN_SOLD: iface.getEvent("TokenSold").topicHash,
  LAUNCHED_TO_DEX: iface.getEvent("LaunchedToDEX").topicHash,
  PROGRESS_CHANGED: iface.getEvent("FlapTokenProgressChanged").topicHash,
};

const TOPIC_TO_NAME = {
  [EVENT_TOPICS.TOKEN_CREATED]: "TokenCreated",
  [EVENT_TOPICS.TOKEN_BOUGHT]: "TokenBought",
  [EVENT_TOPICS.TOKEN_SOLD]: "TokenSold",
  [EVENT_TOPICS.LAUNCHED_TO_DEX]: "LaunchedToDEX",
  [EVENT_TOPICS.PROGRESS_CHANGED]: "FlapTokenProgressChanged",
};

export const TRACKED_TOPICS = Object.values(EVENT_TOPICS);

export function parseLog(log) {
  const name = TOPIC_TO_NAME[log.topics?.[0]];
  if (!name) return null;
  let parsed;
  try {
    parsed = iface.parseLog({ topics: log.topics, data: log.data });
  } catch {
    return null;
  }
  const a = parsed.args;
  const base = {
    rawKind: name,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
    logIndex: log.index ?? log.logIndex ?? 0,
    txIndex: log.transactionIndex ?? 0,
  };

  switch (name) {
    case "TokenCreated":
      return {
        ...base,
        kind: "created",
        token: a.token,
        creator: a.creator,
        name: a.name,
        symbol: a.symbol,
        meta: a.meta,
        nonce: a.nonce?.toString(),
        ts: a.ts?.toString(),
      };
    case "TokenBought":
      return {
        ...base,
        kind: "bought",
        token: a.token,
        buyer: a.buyer,
        amountTokens: a.amount?.toString(),
        quoteSpent: a.eth?.toString(),      // 买入花费的 quote（BNB wei）
        quoteSpentLabel: fromQuote(a.eth ?? 0n),
        fee: a.fee?.toString(),
        postPrice: a.postPrice?.toString(),
        ts: a.ts?.toString(),
      };
    case "TokenSold":
      return {
        ...base,
        kind: "sold",
        token: a.token,
        seller: a.seller,
        amountTokens: a.amount?.toString(),
        quoteReceived: a.eth?.toString(),
        quoteReceivedLabel: fromQuote(a.eth ?? 0n),
        fee: a.fee?.toString(),
        postPrice: a.postPrice?.toString(),
        ts: a.ts?.toString(),
      };
    case "LaunchedToDEX":
      return {
        ...base,
        kind: "launched_dex",
        token: a.token,
        pool: a.pool,
        amount: a.amount?.toString(),
        eth: a.eth?.toString(),
        ethLabel: fromQuote(a.eth ?? 0n),
      };
    case "FlapTokenProgressChanged":
      return { ...base, kind: "progress", token: a.token, newProgress: a.newProgress?.toString() };
    default:
      return null;
  }
}

export { quoteTokenLabel, fromQuote, fromToken };
