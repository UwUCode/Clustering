if (!("send" in process)) process.env.TYPE = "MASTER";
import { SHARDS_PER_CLUSTER } from "./Constants";
import ServiceManager, { ServiceCreator } from "./service/ServiceManager";
import BaseService, { BaseServiceWithSignature } from "./service/BaseService";
import IPC, { Emitted } from "./IPC";
import IPCMaster from "./IPCMaster";
import ClusterManager from "./cluster/ClusterManager";
import Cluster from "./cluster/Cluster";
import StatsContainer from "./StatsContainer";
import { ModuleImport, pid } from "utilities";
import { DefaultEventMap, EventEmitter } from "tsee";
import { BotActivityType, Client, ClientOptions, Status } from "eris";
import Logger from "logger";
import { isMaster } from "cluster";
import path from "path";

export interface BuiltInIPCEvents extends DefaultEventMap {
	"serviceStart": Emitted<null, "service">;
	"serviceSetupDone": Emitted<null, "service">;
	"clusterStart": Emitted<null, "cluster">;
	"clusterReady": Emitted<null, "cluster">;
	"shardConnect": Emitted<number, "cluster">;
	"shardReady": Emitted<number, "cluster">;
	"shardDisconnect": Emitted<{ error: Error; id: number; }, "cluster">;
	"shardResume": Emitted<number, "cluster">;
}


export type ShutdownCallback = () => void;

export interface StartingStatus {
	status: Status;
	game?: {
		name: string;
		type: BotActivityType;
		url?: string;
	};
}

export interface WebhookConfig {
	type: "cluster" | "shard" | "service";
	id: string;
	token: string;
	username?: string;
	avatar?: string;
}

export interface Options {
	path: string;
	token: string;
	shardCount?: number | "auto";
	clusterCount?: number | "auto";
	clientOptions?: ClientOptions;
	clusterTimeout?: number;
	serviceTimeout?: number;
	killTimeout?: number;
	nodeArgs?: Array<string>;
	statsInterval?: number;
	fetchTimeout?: number;
	startingStatus?: StartingStatus | null;
	services?: Array<ServiceCreator>;
	webhooks?: Array<WebhookConfig>;
	pid?: false | string;
}

export type ParsedOptions = Required<Omit<Options, "shardCount" | "clusterCount"> & Record<"shardCount" | "clusterCount", number>>;

export default class Master extends EventEmitter {
	ipc: IPCMaster<BuiltInIPCEvents>;
	options: ParsedOptions;
	services: ServiceManager;
	clusters: ClusterManager;
	eris: Client;
	statsPaused = true;
	private launched = false;
	private current: BaseService | Cluster;
	private statsInterval: NodeJS.Timeout;
	stats?: StatsContainer;
	constructor(opts: Options) {
		super();
		this.ipc = new IPCMaster(this);
		this.options = {
			path: opts.path,
			token: opts.token,
			shardCount: !opts.shardCount || opts.shardCount === "auto" ? 0 : opts.shardCount,
			clusterCount: !opts.clusterCount || opts.clusterCount === "auto" ? 0 : opts.clusterCount,
			clientOptions: opts.clientOptions ?? {},
			clusterTimeout: opts.clusterTimeout ?? 5e3,
			serviceTimeout: opts.serviceTimeout ?? 0,
			killTimeout: opts.killTimeout ?? 1e4,
			nodeArgs: opts.nodeArgs ?? [],
			statsInterval: opts.statsInterval ?? 6e4,
			fetchTimeout: opts.fetchTimeout ?? 1e4,
			startingStatus: opts.startingStatus ?? null,
			services: [],
			webhooks: opts.webhooks ?? [],
			pid: opts.pid ?? false
		};
		if (this.options.pid) pid(`${this.options.pid}/${process.env.TYPE === "MASTER" ? "master" : process.env.TYPE === "CLUSTER" ? `cluster-${process.env.CLUSTER_ID!}` : process.env.TYPE === "SERVICE" ? `service-${process.env.NAME!}` : `unknown-${process.pid}`}.pid`);
		if (!path.isAbsolute(this.options.path)) throw new Error("Provided path must be absolute.");
		(opts.services ?? []).forEach(service => {
			if (!path.isAbsolute(service.path)) throw new Error(`Provided path for the service "${service.name}" must be absolute.`);
			const d = this.options.services.find(s => s.name === service.name);
			if (d) throw new Error(`Duplicate service name ${service.name} in file ${service.path}`);
			this.options.services.push(service);
		});
		this.eris = new Client(`Bot ${this.options.token}`, {
			restMode: true
		});
		this.services = new ServiceManager(this.options.services, this);
		this.clusters = new ClusterManager(this.options, this);
	}

	async launch() {
		if (isMaster) {
			if (this.launched) throw new Error("Already launched.");
			this.launched = true;
			if (this.options.shardCount < 1) {
				const n = Date.now();
				const rec = await this.eris.getBotGateway();
				const d = new Date(n + rec.session_start_limit.reset_after);
				Logger.debug("Manager", `Gateway recommends ${rec.shards} shard${rec.shards !== 1 ? "s" : ""}`);
				Logger.debug("Manager", `Session usage: ${rec.session_start_limit.remaining}/${rec.session_start_limit.total} -- Reset: ${(d.getMonth() + 1).toString().padStart(2, "0")}/${(d.getDate()).toString().padStart(2, "0")}/${d.getFullYear()} ${(d.getHours()).toString().padStart(2, "0")}:${(d.getMinutes()).toString().padStart(2, "0")}:${(d.getSeconds()).toString().padStart(2, "0")}`);
				this.options.shardCount = rec.shards;
			}

			if (this.options.clusterCount < 1) this.options.clusterCount = Math.ceil(this.options.shardCount / SHARDS_PER_CLUSTER);

			// easiest way I could think of
			const shards = Array.from(new Array(this.options.shardCount)).map((_, i) => i);
			const chunks = this.chunkShards(shards, this.options.clusterCount);
			Logger.debug("Manager", `Using ${this.options.shardCount} shard${this.options.shardCount !== 1 ? "s" : ""} and ${this.options.clusterCount} cluster${this.options.clusterCount !== 1 ? "s" : ""}.`);

			// this resolves once all services have completed their setup (done has been called)
			await this.services.start();
			const ck = chunks.map((c, i) => ({
				id: i,
				shards: c,
				firstShard: c[0],
				lastShard: c[c.length - 1]
			}));
			await this.clusters.start(ck);
		} else {
			switch (process.env.TYPE) {
				case "CLUSTER": {
					if (!process.env.JS_PATH) throw new Error("[cluster] JS_PATH is missing in process environment variables");
					if (!process.env.CLUSTER_ID) throw new Error("[cluster] CLUSTER_ID is missing in process environment variables");
					/* const c = */ this.current = new Cluster(Number(process.env.CLUSTER_ID), process.env.JS_PATH);
					break;
				}

				case "SERVICE": {
					if (!process.env.JS_PATH) throw new Error("[service] JS_PATH is missing in process environment variables");
					if (!process.env.NAME) throw new Error("[service] NAME is missing in process environment variables");
					let v = await import(process.env.JS_PATH!) as ModuleImport<BaseServiceWithSignature> | BaseServiceWithSignature;
					if ("default" in v) v = v.default;
					// it's present, but not in typings(?)
					if (!((v as unknown as { prototype: BaseService; }).prototype instanceof BaseService)) throw new Error(`Export in "${process.env.JS_PATH!}" for service ${process.env.NAME!} does not extend BaseService`);
					/* const s = */ this.current = new v({
						name: process.env.NAME!,
						ipc: new IPC()
					});
					break;
				}

				default: throw new Error(`Invalid process type "${process.env.TYPE!}"`);
			}
		}
	}

	private chunkShards(shards: Array<number>, clusters: number) {
		if (clusters < 2) return [shards];

		const length = shards.length;
		const r = [];
		let i = 0;
		let size: number;

		if (length % clusters === 0) {
			size = Math.floor(length / clusters);
			while (i < length) {
				r.push(shards.slice(i, (i += size)));
			}
		} else {
			while (i < length) {
				size = Math.ceil((length - i) / clusters--);
				r.push(shards.slice(i, (i += size)));
			}
		}

		return r;
	}

	startStats() {
		if (this.stats !== undefined) throw new TypeError("stats have already been started");
		this.stats = new StatsContainer();
		this.getStats();
		this.statsInterval = setInterval(this.getStats.bind(this), this.options.statsInterval);
	}

	stopStats() {
		if (this.stats === undefined) throw new TypeError("stats have not been started");
		this.stats = undefined;
		clearInterval(this.statsInterval);
	}

	private getStats() {
		this.stats!.updateMemory();
		this.services.workersByName.forEach((_, name) => this.ipc.sendMessage("getStats", null, `service.${name}`));
		this.clusters.workersById.forEach((_, id) => this.ipc.sendMessage("getStats", null, `cluster.${id}`));
	}
}

process
	.on("uncaughtException", (err) => Logger.error("Uncaught Exception", err))
	.on("unhandledRejection", (err, p) => Logger.error("Unhandled Rejection", err, p));
