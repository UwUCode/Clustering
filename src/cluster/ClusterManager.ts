import { ParsedOptions } from "../Master";
import Master from "..";
import Logger from "logger";
import { Colors, EmbedBuilder } from "core";
import { Worker, fork } from "cluster";

interface ClusterCreator {
	id: number;
	shards: Array<number>;
	firstShard: number;
	lastShard: number;
}

export default class ClusterManager {
	master: Master;
	list: Array<ClusterCreator>;
	private options: ParsedOptions;
	workers = [] as Array<Worker>;
	workersById = new Map<number, Worker>();
	private started = false;
	private firstReady = false;
	private shutdown = [] as Array<number>;
	constructor(opt: ParsedOptions, master: Master) {
		this.options = opt;
		this.master = master;
	}

	async start(clusters: Array<ClusterCreator>) {
		return new Promise<void>((resolve, reject) => {
			if (this.started === true) reject(new TypeError("Clusters have already been started."));
			this.list = clusters;
			Logger.info("ClusterManager", "Launching clusters...");
			const toStart = this.list.map(v => v.id);
			if (toStart.length === 0) {
				Logger.error("ClusterManager", "No clusters to start.");
				return reject(new Error("0 clusters"));
			}
			this.master.ipc
				.on("clusterReady", async(data, messageId, { id }) => {
					const len = this.list.find(v => v.id === id)!.shards.length;
					Logger.info("ClusterManager", `Cluster #${id} is ready.`);
					this.master.options.webhooks.filter(w => w.type === "cluster").forEach(w => this.master.eris.executeWebhook(w.id, w.token, {
						username: w.username,
						avatarURL: w.avatar,
						embeds: [
							new EmbedBuilder("en")
								.setTitle("Cluster Ready")
								.setDescription(`Cluster #${id} is ready!`)
								.setTimestamp(new Date().toISOString())
								.setColor(Colors.green)
								.setFooter(`Cluster ${id + 1}/${this.list.length} | ${len} Shard${len !== 1 ? "s" : ""}`)
								.toJSON()
						]
					}));
					if (this.firstReady === false) {
						toStart.shift();
						if (toStart.length === 0) {
							this.firstReady = true;
							// this.master.ipc.removeAllListeners("clusterReady");
							Logger.info("ClusterManager", "Finished launching clusters.");
							if (this.master.options.statsInterval) this.master.startStats();
							return resolve();
						} else {
							const e = this.list.find(l => l.id === toStart[0])!;
							this.startCluster(e.id, e.shards, e.firstShard, e.lastShard);
						}
					}
				})
				.on("shardConnect", (shardId, messageId, { id }) => {
					Logger.info(`Cluster #${id}`, `Shard #${shardId} has connected.`);
					this.master.options.webhooks.filter(w => w.type === "shard").forEach(w => this.master.eris.executeWebhook(w.id, w.token, {
						username: w.username,
						avatarURL: w.avatar,
						embeds: [
							new EmbedBuilder("en")
								.setTitle("Shard Connect")
								.setDescription(`Shard #${shardId} is connecting..`)
								.setTimestamp(new Date().toISOString())
								.setColor(Colors.blue)
								.setFooter(`Shard ${shardId + 1}/${this.list.find(v => v.id === id)!.shards.length} | Cluster #${id + 1}`)
								.toJSON()
						]
					}));
				})
				.on("shardReady", (shardId, messageId, { id }) => {
					Logger.info(`Cluster #${id}`, `Shard #${shardId} is ready.`);
					this.master.options.webhooks.filter(w => w.type === "shard").forEach(w => this.master.eris.executeWebhook(w.id, w.token, {
						username: w.username,
						avatarURL: w.avatar,
						embeds: [
							new EmbedBuilder("en")
								.setTitle("Shard Ready")
								.setDescription(`Shard #${shardId} is ready!`)
								.setTimestamp(new Date().toISOString())
								.setColor(Colors.green)
								.setFooter(`Shard ${shardId + 1}/${this.list.find(v => v.id === id)!.shards.length} | Cluster #${id + 1}`)
								.toJSON()
						]
					}));
				})
				.on("shardResume", (shardId, messageId, { id }) => {
					Logger.warn(`Cluster #${id}`, `Shard #${shardId} has been resumed`);
					this.master.options.webhooks.filter(w => w.type === "shard").forEach(w => this.master.eris.executeWebhook(w.id, w.token, {
						username: w.username,
						avatarURL: w.avatar,
						embeds: [
							new EmbedBuilder("en")
								.setTitle("Shard Resume")
								.setDescription(`Shard #${shardId} resumed.`)
								.setTimestamp(new Date().toISOString())
								.setColor(Colors.gold)
								.setFooter(`Shard ${shardId + 1} | Cluster #${id + 1}`)
								.toJSON()
						]
					}));
				})
				.on("shardDisconnect", ({ error, id: shardId }, messageId, { id }) => {
					Logger.error(`Cluster #${id}`, `Shard #${shardId} has disconnected:`, error);
					this.master.options.webhooks.filter(w => w.type === "shard").forEach(w => this.master.eris.executeWebhook(w.id, w.token, {
						username: w.username,
						avatarURL: w.avatar,
						embeds: [
							new EmbedBuilder("en")
								.setTitle("Shard Disconnect")
								.setDescription(`Shard #${shardId} has disconnected.`)
								.setTimestamp(new Date().toISOString())
								.setColor(Colors.red)
								.setFooter(`Shard ${shardId + 1} | Cluster #${id + 1}`)
								.toJSON()
						]
					}));
				});
			const e = this.list.find(l => l.id === toStart[0])!;
			this.startCluster(e.id, e.shards, e.firstShard, e.lastShard);
		});
	}

	get(id: number) {
		return this.workersById.get(id);
	}
	has(id: number) {
		return this.get(id) !== undefined;
	}

	startCluster(id: number, shards: Array<number>, shardStart: number, shardEnd: number) {
		const w = fork({
			TYPE: "CLUSTER",
			NODE_ENV: process.env.NODE_ENV,
			CLUSTER_ID: id.toString(),
			JS_PATH: this.options.path
		});
		// so positions are accurate to cluster ids
		// (even though that's not what we use to search, end users might expect that)
		this.workers[id] = w;
		this.workersById.set(id, w);
		w
			.on("message", this.master.ipc.messageHandler.bind(this.master.ipc))
			.on("exit", (code, signal)=> {
				console.log(`exit[cluster-${id}]`, code, signal);
				let shutdown = false;
				if (this.shutdown.includes(id)) {
					shutdown = true;
					this.shutdown.splice(this.shutdown.indexOf(id), 1);
				}
				this.master.options.webhooks.filter(v => v.type === "cluster").forEach(v => this.master.eris.executeWebhook(v.id, v.token, {
					username: v.username,
					avatarURL: v.avatar,
					embeds: [
						new EmbedBuilder("en")
							.setTitle(`Cluster ${shutdown ? "Shutdown" : "Death"}`)
							.setDescription(`Cluster #${id} has ${shutdown ? "been shutdown" : "died"}.`)
							.setTimestamp(new Date().toISOString())
							.setColor(Colors.red)
							.setFooter(`Cluster ${id + 1} | Signal: ${signal}`)
							.toJSON()
					]
				}));
			});
		this.master.ipc.on("clusterStart", () => {
			this.master.ipc.sendMessage("clusterSetup", {
				options: this.options,
				shards,
				shardStart,
				shardEnd
			}, `cluster.${id}`);
		});
		Logger.info("ClusterManager", `Launching cluster #${id} (shard${shards.length !== 1 ? "s" : ""} ${shardStart}-${shardEnd}, PID: ${w.process.pid})`);
		this.master.options.webhooks.filter(v => v.type === "cluster").forEach(v => this.master.eris.executeWebhook(v.id, v.token, {
			username: v.username,
			avatarURL: v.avatar,
			embeds: [
				new EmbedBuilder("en")
					.setTitle("Cluster Launching")
					.setDescription(`Cluster #${id} is launching with **${shards.length}** shard${shards.length !== 1 ? "s" : ""}.`)
					.setTimestamp(new Date().toISOString())
					.setColor(Colors.green)
					.setFooter(`Cluster ${id + 1}/${this.list.length}`)
					.toJSON()
			]
		}));
	}

	restartCluster(id: number, force = false) {
		const c = this.get(id);
		const l = this.list.find(v => v.id === id);
		if (!c) throw new Error(`Unknown cluster "${id}".`);
		if (!l) throw new Error(`Unable to find information for the cluster ${id}.`);
		Logger.warn("ServiceManager", `Restarting the cluster "${id}" (force: ${force ? "Yes" : "No"})`);
		if (force) c.kill("SIGKILL");
		else this.master.ipc.sendMessage("shutdown", force, `cluster.${id}`);
	}

	restartAllClusters(force = false) {
		this.shutdownClusterStep(this.list[0].id, force);
	}

	private shutdownClusterStep(id: number, force = false) {
		this.master.ipc.sendMessage("shutdown", force, `cluster.${id}`);
		if (force) this.get(id)!.kill("SIGKILL");
		// restart done
		if (this.list[this.list.length - 1].id === id) return;
		this.master.ipc.once("clusterReady", () => this.shutdownClusterStep(id + 1, force));
	}

	shutdownCluster(id: number, force = false) {
		const c = this.get(id);
		const l = this.list.find(v => v.id === id);
		if (!c) throw new Error(`Unknown cluster "${id}".`);
		if (!l) throw new Error(`Unable to find information for the cluster ${id}.`);
		this.shutdown.push(id);
		Logger.warn("ServiceManager", `Restarting the cluster "${id}" (force: ${force ? "Yes" : "No"})`);
		if (force) c.kill("SIGKILL");
		else this.master.ipc.sendMessage("shutdown", force, `cluster.${id}`);
	}

	shutdownAllClusters(force = false) {
		this.list.forEach(({ id }) => this.shutdownCluster(id, force));
	}
}
