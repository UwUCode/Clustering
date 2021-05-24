import { ServiceDefaultEvents } from "./service/ServiceManager";
import Cluster, { ClusterDefaultEvents } from "./cluster/Cluster";
import { DEBUG, EVAL_RESPONSE_CODES } from "./Constants";
import { ShardStats, Stats } from "./IPCMaster";
import BaseService from "./service/BaseService";
import { EventEmitter } from "tsee";
import Logger from "logger";
import { Utility } from "utilities";
import crypto from "crypto";

export interface ServiceMessageRoute {
	type: "service";
	name: string;
}
export interface ClusterMessageRoute {
	type: "cluster";
	id: number;
}
// I overcomplicate everything
export type MessageRoute<R extends "service" | "cluster" | "master" | "all" = "all"> =
R extends "service" ? ServiceMessageRoute :
	R extends "cluster" ? ClusterMessageRoute :
		R extends "master" ? "master" :
			R extends "all" ? "master" | ServiceMessageRoute | ClusterMessageRoute :
				never;

export interface ProcessMessage {
	op: string;
	data: unknown;
	messageId: string;
	// this would work, but an object makes easier processing
	// from: "master" | `Cluster${number}` | `Service${string}`;
	from: MessageRoute;
	to: MessageRoute | null;
}

export type EvalResponse<R = unknown> = EvalResponseSuccess<R> | EvalResponseTimeout | EvalResponseUnknown;

export interface EvalResponseSuccess<R = unknown> {
	time: Record<"start" | "end" | "total", number>;
	result: {
		error: boolean;
		data: R;
	};
	code: typeof EVAL_RESPONSE_CODES["OK"];
}

export interface EvalResponseTimeout {
	time: null;
	result: null;
	code: typeof EVAL_RESPONSE_CODES["TIMEOUT"];
}
export interface EvalResponseUnknown {
	time: null;
	result: null;
	code: typeof EVAL_RESPONSE_CODES["UNKNOWN"];
}

export type Emitted<D = unknown, S extends "service" | "cluster" | "master" | "all" = "all"> = (data: D, messageId: string, from: MessageRoute<S>) => void;

export type ProcessMessageReference = string;

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- I don't care
export default class IPC<E = ServiceDefaultEvents | ClusterDefaultEvents> extends EventEmitter<E & Record<"statsResponse", Emitted<Stats, "master">>> {
	static generateRandomId() {
		return crypto.randomBytes(16).toString("hex");
	}
	get generateRandomId() {
		return IPC.generateRandomId.bind(IPC);
	}
	protected cb = new Map<string, Record<"reject" | "resolve", (...args: Array<unknown>) => void>>();
	constructor() {
		super();
		process.on("message", this.messageHandler.bind(this));
	}

	/**
	 * Send a message to a different process
	 *
	 * @param {string} op - The op code for the reciever
	 * @param {unknown} data - The data to send
	 * @param {(`cluster.${number}` | `service.${string}` | null)} [to="master"] - The service or cluster to send the message to. Master if empty or null.
	 */
	sendMessage(op: string, data: unknown = null, to?: `cluster.${number}` | `service.${string}` | "master"): ProcessMessageReference {
		// distinguish between nothing and delibrate undefined
		// eslint-disable-next-line prefer-rest-params
		// if (data === undefined && !Object.prototype.hasOwnProperty.call(arguments, "1")) data = null;
		if (!("send" in process)) throw new Error("process#send is not present.");
		const id = IPC.generateRandomId();
		const [type, value] = to?.split(".") ?? [];
		if (DEBUG) Logger.debug(`IPC#sendMessage[${process.env.TYPE ?? "UNKNOWN"}]`, "Sending ipc message to", to ?? "master", "op:", op, "data:", data);
		process.send!({
			op,
			data,
			messageId: id,
			from: process.env.TYPE === "MASTER" ? "master" :
				process.env.TYPE === "CLUSTER" ? { type: "cluster", id: Number(process.env.CLUSTER_ID) } :
					process.env.TYPE === "SERVICE" ? { type: "service", name: process.env.NAME } :
						null,
			to: to === "master" || !type ? "master" :
				type === "cluster" ? { type: "cluster", id: Number(value) } :
					type === "service" ? { type: "service", name: value } :
						null
		} as ProcessMessage);
		return id;
	}


	sendToMaster(op: string, data: unknown = null) { return this.sendMessage(op, data, "master"); }
	sendToCluster(id: number, op: string, data: unknown = null) { return this.sendMessage(op, data, `cluster.${id}`); }
	sendToService(name: string, op: string, data: unknown = null) { return this.sendMessage(op, data, `service.${name}`); }
	sendToRoute(r: MessageRoute, op: string, data: unknown = null) { return this.sendMessage(op, data, r === "master" ? "master" : r.type === "cluster" ? `cluster.${r.id}` : `service.${r.name}`); }

	/* eslint-disable @typescript-eslint/ban-ts-comment */
	// @ts-ignore
	register<D = never, F extends "cluster" | "service" | "master" | "all" = never>(name: string, handler: Emitted<D, F>) { this.on(name, handler); }

	// @ts-ignore
	registerOnce<D = never, F extends "cluster" | "service" | "master" | "all" = "all">(name: string, handler: Emitted<D, F>) { this.once(name, handler); }

	// @ts-ignore
	unregister(name: string) { this.removeAllListeners(name); }
	/* eslint-enable @typescript-eslint/ban-ts-comment */

	async serviceCommand<R = unknown>(service: string, data: unknown, responsive: true): Promise<R>;
	async serviceCommand(service: string, data: unknown, responsive?: false): Promise<void>;
	async serviceCommand<R = unknown>(service: string, data: unknown, responsive = false): Promise<R | void> {
		return new Promise<R | void>((resolve, reject) => {
			const id = this.sendMessage("serviceCommand", { responsive, cmdData: data }, `service.${service}`);
			if (!responsive) return resolve();
			else {
				const t = setTimeout(() => reject(new Error("Response timed out.")), 1.5e4);
				this.registerOnce<R>(id, (d) => {
					clearTimeout(t);
					resolve(d);
				});
			}
		});
	}

	protected messageHandler(message: string | ProcessMessage) {
		const { op, data, messageId, from, to } = typeof message === "string" ? JSON.parse(message) as ProcessMessage: message;
		if (DEBUG) Logger.debug(`IPC#messageHandler[${process.env.TYPE ?? "UNKNOWN"}]`, "Recieved ipc message from", from, "op:", op, "data:", data, "to:", to);

		if (process.env.TYPE === "MASTER" && to && to !== "master") {
			if (to.type === "cluster") this.sendMessage(op, data, `cluster.${to.id}`);
			else if (to.type === "service") this.sendMessage(op, data, `service.${to.name}`);
			else throw new Error(`Invalid "to.type" recieved: ${(to as { type: string; }).type}`);
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		} else this.emit(op, data, messageId, from);
	}

	async getStats(error: false): Promise<Stats | null>;
	async getStats(error?: true): Promise<Stats>;
	async getStats(error = true) {
		return new Promise<Stats | null>((resolve, reject) => {
			const id = this.sendMessage("fetchStats", null, "master");
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- I can't make definitions for all of the possible ids
			// @ts-ignore
			this.once(id, ((data: Stats | null) => {
				clearInterval(t);
				if (data === null) {
					if (error) reject(new Error("stats are either not enabled, or they have not been processed yet"));
					else resolve(null);
					return;
				}
				delete (data as { shards?: unknown; }).shards;
				// big memory waste to ship all shard stats twice
				Utility.definePropertyIfNotPresent(data, "shards", {
					get(this: Stats) {
						return this.clusters.reduce((a,b) => a.concat(...b.shards), [] as Array<ShardStats>);
					}
				});
				return resolve(data);
			}));
			const t = setTimeout(() => {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- I can't make definitions for all of the possible ids
				// @ts-ignore
				this.removeAllListeners(id);
				reject(new Error("stats timed out"));
			}, 1.5e4);
		});
	}

	async evalAtCluster<T extends { [k: string]: string | number | boolean; } = never>(id: number, code: ((this: Cluster, args: T) => Promise<unknown>) | string, args?: T) {
		code = this.parse(code, args);
		return new Promise<EvalResponse>((resolve, reject) => {
			const msgId = this.sendMessage("evalAtCluster", { id, code }, "master");
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- I can't make definitions for all of the possible ids
			// @ts-ignore
			this.once(msgId, ((data: EvalResponse) => {
				clearInterval(t);
				return resolve(data);
			}));
			const t = setTimeout(() => {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- I can't make definitions for all of the possible ids
				// @ts-ignore
				this.removeAllListeners(msgId);
				reject(new Error("evalAtCluster timed out"));
			}, 1.5e4);
		});
	}

	async evalAtService<T extends { [k: string]: string | number | boolean; } = never, S extends BaseService = BaseService>(name: number, code: ((this: S, args: T) => Promise<unknown>) | string, args?: T) {
		code = this.parse(code, args);
		return new Promise<EvalResponse>((resolve, reject) => {
			const msgId = this.sendMessage("evalAtService", { name, code }, "master");
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- I can't make definitions for all of the possible ids
			// @ts-ignore
			this.once(msgId, ((data: EvalResponse) => {
				clearInterval(t);
				return resolve(data);
			}));
			const t = setTimeout(() => {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- I can't make definitions for all of the possible ids
				// @ts-ignore
				this.removeAllListeners(msgId);
				reject(new Error("evalAtService timed out"));
			}, 1.5e4);
		});
	}

	async broadcastClusterEval<R = unknown, T extends { [k: string]: string | number | boolean; } = Record<string, string | number | boolean>>(code: ((this: Cluster, args: T) => Promise<R>) | string, args?: T) {
		code = this.parse(code, args);
		return new Promise<Array<EvalResponse<R> & { clusterId: number; }>>((resolve, reject) => {
			const msgId = this.sendMessage("broadcastClusterEval", code, "master");
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- I can't make definitions for all of the possible ids
			// @ts-ignore
			this.once(msgId, ((data: Array<EvalResponse<R> & { clusterId: number; }>) => {
				clearInterval(t);
				return resolve(data);
			}));
			const t = setTimeout(() => {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- I can't make definitions for all of the possible ids
				// @ts-ignore
				this.removeAllListeners(msgId);
				reject(new Error("broadcastClusterEval timed out"));
			}, 3e4);
		});
	}

	async broadcastServiceEval<R = unknown, T extends { [k: string]: string | number | boolean; } = Record<string, string | number | boolean>, S extends BaseService = BaseService>(code: ((this: S, args: T) => Promise<R>) | string, args?: T) {
		code = this.parse(code, args);
		return new Promise<Array<EvalResponse<R> & { serviceName: string; }>>((resolve, reject) => {
			const msgId = this.sendMessage("broadcastServiceEval", code, "master");
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- I can't make definitions for all of the possible ids
			// @ts-ignore
			this.once(msgId, ((data: Array<EvalResponse<R> & { serviceName: string; }>) => {
				clearInterval(t);
				return resolve(data);
			}));
			const t = setTimeout(() => {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- I can't make definitions for all of the possible ids
				// @ts-ignore
				this.removeAllListeners(msgId);
				reject(new Error("broadcastServiceEval timed out"));
			}, 3e4);
		});
	}

	async broadcastEval<R = unknown, T extends { [k: string]: string | number | boolean; } =  Record<string, string | number | boolean>, S extends BaseService = BaseService>(code: ((this: Cluster | S, args: T) => Promise<R>) | string, args?: T) {
		const clusters = await this.broadcastClusterEval<R>(code as string, args);
		const services = await this.broadcastServiceEval<R>(code as string, args);

		return {
			clusters,
			services
		};
	}

	parse<T extends { [k: string]: string | number | boolean; } = {}>(d: Function | string, args?: T) { // eslint-disable-line @typescript-eslint/ban-types
		if (!args) args = {} as T;
		if (typeof d === "string") return d;
		if (typeof d === "function") d = d.toString();
		// this doesn't work that well so I removed it
		// function def(m) { return m.default ?? m; };${Object.entries(this.modules).map(([key, value]) => `const ${key} = def(require("${value}"))`).join(";")};
		return `(async()=>{const args = JSON.parse(\`${JSON.stringify(args)}\`);${d.slice(d.indexOf("{") + 1, d.lastIndexOf("}")).trim()}})()`
		/* .replace(/_[\d]\.default/g, "") */;
	}

	/**
	 * Restart a singular cluster
	 *
	 * @param {number} id - The id of the cluster to restart
	 * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
	 */
	restartCluster(id: number, force = false) {
		this.sendMessage("restartCluster", { id, force }, "master");
	}

	/**
	 * Restart all clusters
	 *
	 * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
	 */
	restartAllClusters(force = false) {
		this.sendMessage("restartAllClusters", { force }, "master");
	}

	/**
	 * Shutdown a singular cluster
	 *
	 * @param {number} id - The id of the cluster to shutdown
	 * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
	 */
	shutdownCluster(id: number, force = false) {
		this.sendMessage("shutdownCluster", { id, force }, "master");
	}

	/**
	 * start a cluster
	 *
	 * @param {number} id - The id of the cluster to start
	 */
	startCluster(id: number) {
		this.sendMessage("startCluster", { id }, "master");
	}

	/**
	 * Shutdown all clusters
	 *
	 * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
	 */
	shutdownAllClusters(force = false) {
		this.sendMessage("shutdownAllClusters", { force }, "master");
	}

	/**
	 * Restart a singular service
	 *
	 * @param {string} name - The name of the service to restart
	 * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
	 */
	restartService(name: string, force = false) {
		this.sendMessage("restartService", { name, force }, "master");
	}

	/**
	 * Restart all services
	 *
	 * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
	 */
	restartAllServices(force = false) {
		this.sendMessage("restartAllServices", { force }, "master");
	}

	/**
	 * Shutdown a singular service
	 *
	 * @param {string} name - The name of the service to shutdown
	 * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
	 */
	shutdownService(name: string, force = false) {
		this.sendMessage("shutdownService", { name, force }, "master");
	}

	/**
	 * Shutdown all services
	 *
	 * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
	 */
	shutdownAllServices(force = false) {
		this.sendMessage("shutdownAllServices", { force }, "master");
	}

	/**
	 * Shutdown all clusters & services
	 *
	 * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
	 */
	totalShutdown(hard = false) {
		this.sendMessage("totalShutdown", { hard }, "master");
	}
}
