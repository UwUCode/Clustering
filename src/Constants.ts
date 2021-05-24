export const SHARDS_PER_CLUSTER = 10;
export const DEBUG = process.env.IPC_DEBUG === "1";
export const EVAL_RESPONSE_CODES = {
	OK: 0,
	TIMEOUT: 1,
	UNKNOWN: 2
} as const;
