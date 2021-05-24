import Base, { BaseWithSignature } from "./Base";
import IPC, { Emitted } from "../IPC";
import { Options } from "../Master";
import Eris from "eris";
import { ModuleImport } from "utilities";
import { performance } from "perf_hooks";

export interface ClusterDefaultEvents {
	"clusterSetup": Emitted<{
		options: Options;
		shards: Array<number>;
		shardStart: number;
		shardEnd: number;
	}, "master">;
	"getStats": Emitted<null, "master">;
	"evalAtCluster": Emitted<string, "master">;
	"launch": Emitted<null, "master">;
	"shutdown": Emitted<boolean, "master">;
}

export default class Cluster {
	ipc: IPC<ClusterDefaultEvents>;
	id: number;
	path: string;
	class: Base;
	client: Eris.Client;
	options: Options;
	shards: Array<number>;
	shardStart: number;
	shardEnd: number;
	constructor(id: number, path: string) {
		this.ipc = new IPC();
		this.id = id;
		this.path = path;
		this.ipc
			.on("clusterSetup", ({ options, shards, shardStart, shardEnd }) => {
				this.options = options;
				this.shards = shards;
				this.shardStart = shardStart;
				this.shardEnd = shardEnd;
				void this.start();
			})
			.on("getStats", () => this.ipc.sendMessage("stats", {
				id: this.id,
				memory: process.memoryUsage(),
				uptime: process.uptime(),
				shards: this.client.shards.map(s => ({
					id: s.id,
					clusterId: this.id,
					latency: s.latency,
					status: s.status,
					guilds: this.client.guilds.filter(g => g.shard.id === s.id).length,
					largeGuilds: this.client.guilds.filter(g => g.shard.id === s.id && g.large).length
				})),
				guilds: this.client.guilds.size,
				users: this.client.users.size,
				voiceConnections: this.client.voiceConnections.size,
				guildChannels: Object.keys(this.client.channelGuildMap).length,
				dmChannels: Object.keys(this.client.privateChannelMap).length,
				largeGuilds: this.client.guilds.filter(g => g.large).length
			}))
			.on("evalAtCluster", async(data, messageId, from) => {
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
				this.ipc.sendMessage(messageId, { time: { start, end, total: parseFloat((end - start).toFixed(3)) }, result: { error, data: res } }, from);
			})
			.sendMessage("clusterStart", null, "master");
	}

	private async start() {
		let v = await import(process.env.JS_PATH!) as ModuleImport<BaseWithSignature> | BaseWithSignature;
		if ("default" in v) v = v.default;
		// it's present, but not in typings(?)
		if (!((v as unknown as { prototype: Base; }).prototype instanceof Base)) throw new Error(`Export in "${process.env.JS_PATH!}" does not extend Base`);
		this.class = new v({
			cluster: this
		});
		const e = this.client = new Eris.Client(`Bot ${this.options.token}`, {
			...this.options.clientOptions,
			firstShardID: this.shardStart,
			lastShardID: this.shardEnd,
			maxShards: this.options.shardCount
		});
		void e
			.on("shardReady", (id) => this.ipc.sendMessage("shardReady", id, "master"))
			.on("shardDisconnect", (error, id) => this.ipc.sendMessage("shardDisconnect", { error, id }, "master"))
			.on("shardResume", (id) => this.ipc.sendMessage("shardResume", id, "master"))
			.on("connect", (id) => this.ipc.sendMessage("shardConnect", id, "master"))
			.once("ready", () => {
				this.ipc.sendMessage("clusterReady", null, "master");
				void this.class.launch();
			})
			.connect();
	}
}
