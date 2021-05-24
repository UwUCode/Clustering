/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// I can't make definitions for all of the possible ids and such
import IPC, { ProcessMessage, ProcessMessageReference, MessageRoute, EvalResponse } from "./IPC";
import Master from "./Master";
import { DEBUG, EVAL_RESPONSE_CODES } from "./Constants";
import { DefaultEventMap } from "tsee";
import Logger from "logger";
import Eris from "eris";
import { performance } from "perf_hooks";


export interface Stats {
	memory: NodeJS.MemoryUsage;
	combinedMemory: NodeJS.MemoryUsage;
	clusters: Array<ClusterStats>;
	shards: Array<ShardStats>;
	services: Array<ServiceStats>;
}

export interface ClusterStats {
	id: number;
	memory: NodeJS.MemoryUsage;
	uptime: number;
	shards: Array<ShardStats>;
	guilds: number;
	users: number;
	voiceConnections: number;
	guildChannels: number;
	dmChannels: number;
	largeGuilds: number;
}

export interface ShardStats {
	id: number;
	clusterId: number;
	latency: number;
	status: Eris.Shard["status"];
	guilds: number;
	largeGuilds: number;
}

export interface ServiceStats {
	name: string;
	memory: NodeJS.MemoryUsage;
	uptime: number;
	processedCommands: number;
}

export default class IPCMaster<E extends DefaultEventMap = DefaultEventMap> extends IPC<E> {
	master: Master;
	active = true;
	constructor(master: Master) {
		super();
		if (process.env.TYPE === "MASTER") {
			this.master = master;
			this
				.on("stats", ((data: ClusterStats | ServiceStats, messageId: string, from: MessageRoute<"cluster" | "service">) => {
					switch (from.type) {
						case "cluster": this.master.stats!.clusters.push(data as ClusterStats); break;
						case "service": this.master.stats!.services.push(data as ServiceStats); break;
						default: throw new TypeError("invalid stats type recieved");
					}
				}) as any)
				.on("fetchStats", ((data: null, messageId: string, from: MessageRoute<"cluster" | "service">) => {
					this.sendMessage(messageId, this.master.stats === undefined ? null : JSON.parse(JSON.stringify(this.master.stats)), from.type === "cluster" ? `${from.type}.${from.id}` : `${from.type}.${from.name}`);
				}) as any)
				.on("evalAtMaster", (async(data: string, messageId: string, from: MessageRoute<"cluster" | "service">) => {
					const start = parseFloat(performance.now().toFixed(3));
					let res: unknown, error = false;
					try {
					// eslint-disable-next-line no-eval
						res = await eval(data);
					} catch (e) {
						error = true;
						res = e;
					}
					const end = parseFloat(performance.now().toFixed(3));
					this.sendMessage(messageId, {
						time: {
							start,
							end,
							total: parseFloat((end - start).toFixed(3))
						},
						result: {
							error,
							data: res
						} ,
						code: EVAL_RESPONSE_CODES.OK
					}, from.type === "cluster" ? `${from.type}.${from.id}` : `${from.type}.${from.name}`);
				}) as any)
				.on("evalAtCluster", (async({ id, code }: { id: number; code: string; }, messageId: string, from: MessageRoute<"cluster" | "service">) => {
					const msgId = this.sendMessage("evalAtCluster", code, `cluster.${id}`);
					// @ts-ignore
					this.once(msgId, (data: EvalResponse) => {
						this.sendMessage(messageId, data, from.type === "cluster" ? `${from.type}.${from.id}` : `${from.type}.${from.name}`);
					});
				}) as any)
				.on("evalAtService", (async({ name, code }: { name: string; code: string; }, messageId: string, from: MessageRoute<"cluster" | "service">) => {
					const msgId = this.sendMessage("evalAtService", code, `service.${name}`);
					// @ts-ignore
					this.once(msgId, (data: EvalResponse) => {
						this.sendMessage(messageId, data, from.type === "cluster" ? `${from.type}.${from.id}` : `${from.type}.${from.name}`);
					});
				}) as any)
				.on("broadcastClusterEval", (async(data: string, messageId: string, from: MessageRoute<"cluster" | "service">) => {
					const res: Array<EvalResponse & { clusterId: number; }> = [];
					await Promise.all(this.master.clusters.list.map((v) => new Promise<void>((resolve) => {
						const id = this.sendMessage("evalAtCluster", data, `cluster.${v.id}`);
						this.once(id, ((d: EvalResponse & { clusterId: number; }) => {
							d.clusterId = v.id;
							res[v.id] = d;
							clearTimeout(t);
							resolve();
						}) as any);
						const t = setTimeout(() => {
							this.removeAllListeners(id);
							res[v.id] = {
								clusterId: v.id,
								time: null,
								result: null,
								code: EVAL_RESPONSE_CODES.TIMEOUT
							};
							resolve();
						}, 1.5e4);
					})));

					this.sendMessage(messageId, res, from.type === "cluster" ? `${from.type}.${from.id}` : `${from.type}.${from.name}`);
				}) as any)
				.on("broadcastServiceEval", (async(data: string, messageId: string, from: MessageRoute<"cluster" | "service">) => {
					const res: Record<string, EvalResponse & { serviceName: string; }> = {};
					await Promise.all(this.master.services.list.map((v) => new Promise<void>((resolve) => {
						const id = this.sendMessage("evalAtService", data, `service.${v.name}`);
						this.once(id, ((d: EvalResponse & { serviceName: string; }) => {
							d.serviceName = v.name;
							res[v.name] = d;
							clearTimeout(t);
							resolve();
						}) as any);
						const t = setTimeout(() => {
							this.removeAllListeners(id);
							res[v.name] = {
								serviceName: v.name,
								time: null,
								result: null,
								code: EVAL_RESPONSE_CODES.TIMEOUT
							};
							resolve();
						}, 1.5e4);
					})));

					this.sendMessage(messageId, res, from.type === "cluster" ? `${from.type}.${from.id}` : `${from.type}.${from.name}`);
				}) as any)
				.on("restartCluster", (({ id, force }: { id: number; force: boolean; }) => this.restartCluster(id, force)) as any)
				.on("restartAllClusters", (({ force }: { force: boolean; }) => this.restartAllClusters(force)) as any)
				.on("shutdownCluster", (({ id, force }: { id: number; force: boolean; }) => this.shutdownCluster(id, force)) as any)
				.on("startCluster", (({ id }: { id: number; }) => this.startCluster	(id)) as any)
				.on("shutdownAllClusters", (({ force }: { force: boolean; }) => this.shutdownAllClusters(force)) as any)
				.on("restartService", (({ name, force }: { name: string; force: boolean; }) => this.restartService(name, force)) as any)
				.on("restartAllServices", (({ force }: { force: boolean; }) => this.restartAllServices(force)) as any)
				.on("shutdownService", (({ name, force }: { name: string; force: boolean; }) => this.shutdownService(name, force)) as any)
				.on("shutdownAllServices", (({ force }: { force: boolean; }) => this.shutdownAllServices(force)) as any);
		} else this.active = false;
	}

	/**
	 * Send a message to a different process
	 *
	 * @param {string} op - The op code for the reciever
	 * @param {unknown} data - The data to send
	 * @param {(`cluster.${number}` | `service.${string}`)} to - The service or cluster to send the message to.
	 */
	override sendMessage(op: string, data: unknown, to: `cluster.${number}` | `service.${string}`): ProcessMessageReference {
		if (process.env.TYPE !== "MASTER") throw new Error(`IPCMaster used from non-MASTER process (${process.env.TYPE ?? "UNKNOWN"})`);
		const id = IPC.generateRandomId();
		const [type, value] = to.split(".") ?? [];
		if (DEBUG) Logger.debug(`IPC#sendMessage[${process.env.TYPE ?? "UNKNOWN"}]`, "Sending ipc message to", to ?? "master", "op:", op, "data:", data);
		switch (type) {
			case "cluster": {
				const c = this.master.clusters.get(Number(value));
				if (!c) throw new Error(`Unknown cluster #${value}`);
				c.send({
					op,
					data,
					messageId: id,
					from: "master"
				} as ProcessMessage);
				break;
			}

			case "service": {
				const s = this.master.services.get(value);
				if (!s) throw new Error(`Unknown service "${value}"`);
				s.send({
					op,
					data,
					messageId: id,
					from: "master"
				} as ProcessMessage);
				break;
			}
		}
		return id;
	}

	override messageHandler(message: string | ProcessMessage) {
		return super.messageHandler.call(this, message);
	}

	/**
	 * Restart a singular cluster
	 *
	 * @param {number} id - The id of the cluster to restart
	 * @param {boolean} [force=false] - If we should just kill the process instead of gracefully restarting
	 */
	override restartCluster(id: number, force = false) {
		this.master.clusters.restartCluster(id, force);
	}

	/**
	 * Restart all clusters
	 *
	 * @param {boolean} [force=false] - If we should just kill the processes instead of gracefully restarting
	 */
	override restartAllClusters(force = false) {
		this.master.clusters.restartAllClusters(force);
	}

	/**
	 * Shutdown a singular cluster
	 *
	 * @param {number} id - The id of the cluster to shutdown
	 * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
	 */
	override shutdownCluster(id: number, force = false) {
		this.master.clusters.shutdownCluster(id, force);
	}

	/**
	 * start a cluster
	 *
	 * @param {number} id - The id of the cluster to start
	 */
	override startCluster(id: number) {
		const l = this.master.clusters.list.find(v => v.id === id)!;
		this.master.clusters.startCluster(id, l.shards, l.firstShard, l.lastShard);
	}

	/**
	 * Shutdown all clusters
	 *
	 * @param {boolean} [force=false] - If we should just kill the processes instead of gracefully shutting down
	 */
	override shutdownAllClusters(force = false) {
		this.master.clusters.shutdownAllClusters(force);
	}

	/**
	 * Restart a singular service
	 *
	 * @param {string} name - The name of the service to restart
	 * @param {boolean} [force=false] - If we should just kill the process instead of gracefully restarting
	 */
	override restartService(name: string, force = false) {
		this.master.services.restartService(name, force);
	}

	/**
	 * Restart all services
	 *
	 * @param {boolean} [force=false] - If we should just kill the processes instead of gracefully restarting
	 */
	override restartAllServices(force = false) {
		this.master.services.restartAllServices(force);
	}

	/**
	 * Shutdown a singular service
	 *
	 * @param {string} name - The name of the service to shutdown
	 * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
	 */
	override shutdownService(name: string, force = false) {
		this.master.services.shutdownService(name, force);
	}

	/**
	 * Shutdown all services
	 *
	 * @param {boolean} [force=false] - If we should just kill the processes instead of gracefully shutting down
	 */
	override shutdownAllServices(force = false) {
		this.master.services.shutdownAllServices(force);
	}

	/**
	 * Shutdown all clusters & services
	 *
	 * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
	 */
	override totalShutdown(force = false) {
		if (force) return process.kill(process.pid, "SIGKILL");
		this.master.clusters.restartAllClusters(force);
		this.master.services.restartAllServices(force);
		// I can't be bothered with doing checks 'n' stuff, so
		// we just wait 15 seconds and exit with SIGTERM/15
		setTimeout(() => {
			process.kill(process.pid, "SIGTERM");
		}, 1.5e4);
	}
}
