"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("logger"));
const core_1 = require("core");
const cluster_1 = require("cluster");
class ClusterManager {
    master;
    list;
    options;
    workers = [];
    workersById = new Map();
    started = false;
    firstReady = false;
    shutdown = [];
    constructor(opt, master) {
        this.options = opt;
        this.master = master;
    }
    async start(clusters) {
        return new Promise((resolve, reject) => {
            if (this.started === true)
                reject(new TypeError("Clusters have already been started."));
            this.list = clusters;
            logger_1.default.info("ClusterManager", "Launching clusters...");
            const toStart = this.list.map(v => v.id);
            if (toStart.length === 0) {
                logger_1.default.error("ClusterManager", "No clusters to start.");
                return reject(new Error("0 clusters"));
            }
            this.master.ipc
                .on("clusterReady", async (data, messageId, { id }) => {
                const len = this.list.find(v => v.id === id).shards.length;
                logger_1.default.info("ClusterManager", `Cluster #${id} is ready.`);
                this.master.options.webhooks.filter(w => w.type === "cluster").forEach(w => this.master.eris.executeWebhook(w.id, w.token, {
                    username: w.username,
                    avatarURL: w.avatar,
                    embeds: [
                        new core_1.EmbedBuilder("en")
                            .setTitle("Cluster Ready")
                            .setDescription(`Cluster #${id} is ready!`)
                            .setTimestamp(new Date().toISOString())
                            .setColor(core_1.Colors.green)
                            .setFooter(`Cluster ${id + 1}/${this.list.length} | ${len} Shard${len !== 1 ? "s" : ""}`)
                            .toJSON()
                    ]
                }));
                if (this.firstReady === false) {
                    toStart.shift();
                    if (toStart.length === 0) {
                        this.firstReady = true;
                        // this.master.ipc.removeAllListeners("clusterReady");
                        logger_1.default.info("ClusterManager", "Finished launching clusters.");
                        if (this.master.options.statsInterval)
                            this.master.startStats();
                        return resolve();
                    }
                    else {
                        const e = this.list.find(l => l.id === toStart[0]);
                        this.startCluster(e.id, e.shards, e.firstShard, e.lastShard);
                    }
                }
            })
                .on("shardConnect", (shardId, messageId, { id }) => {
                logger_1.default.info(`Cluster #${id}`, `Shard #${shardId} has connected.`);
                this.master.options.webhooks.filter(w => w.type === "shard").forEach(w => this.master.eris.executeWebhook(w.id, w.token, {
                    username: w.username,
                    avatarURL: w.avatar,
                    embeds: [
                        new core_1.EmbedBuilder("en")
                            .setTitle("Shard Connect")
                            .setDescription(`Shard #${shardId} is connecting..`)
                            .setTimestamp(new Date().toISOString())
                            .setColor(core_1.Colors.blue)
                            .setFooter(`Shard ${shardId + 1}/${this.list.find(v => v.id === id).shards.length} | Cluster #${id + 1}`)
                            .toJSON()
                    ]
                }));
            })
                .on("shardReady", (shardId, messageId, { id }) => {
                logger_1.default.info(`Cluster #${id}`, `Shard #${shardId} is ready.`);
                this.master.options.webhooks.filter(w => w.type === "shard").forEach(w => this.master.eris.executeWebhook(w.id, w.token, {
                    username: w.username,
                    avatarURL: w.avatar,
                    embeds: [
                        new core_1.EmbedBuilder("en")
                            .setTitle("Shard Ready")
                            .setDescription(`Shard #${shardId} is ready!`)
                            .setTimestamp(new Date().toISOString())
                            .setColor(core_1.Colors.green)
                            .setFooter(`Shard ${shardId + 1}/${this.list.find(v => v.id === id).shards.length} | Cluster #${id + 1}`)
                            .toJSON()
                    ]
                }));
            })
                .on("shardResume", (shardId, messageId, { id }) => {
                logger_1.default.warn(`Cluster #${id}`, `Shard #${shardId} has been resumed`);
                this.master.options.webhooks.filter(w => w.type === "shard").forEach(w => this.master.eris.executeWebhook(w.id, w.token, {
                    username: w.username,
                    avatarURL: w.avatar,
                    embeds: [
                        new core_1.EmbedBuilder("en")
                            .setTitle("Shard Resume")
                            .setDescription(`Shard #${shardId} resumed.`)
                            .setTimestamp(new Date().toISOString())
                            .setColor(core_1.Colors.gold)
                            .setFooter(`Shard ${shardId + 1} | Cluster #${id + 1}`)
                            .toJSON()
                    ]
                }));
            })
                .on("shardDisconnect", ({ error, id: shardId }, messageId, { id }) => {
                logger_1.default.error(`Cluster #${id}`, `Shard #${shardId} has disconnected:`, error);
                this.master.options.webhooks.filter(w => w.type === "shard").forEach(w => this.master.eris.executeWebhook(w.id, w.token, {
                    username: w.username,
                    avatarURL: w.avatar,
                    embeds: [
                        new core_1.EmbedBuilder("en")
                            .setTitle("Shard Disconnect")
                            .setDescription(`Shard #${shardId} has disconnected.`)
                            .setTimestamp(new Date().toISOString())
                            .setColor(core_1.Colors.red)
                            .setFooter(`Shard ${shardId + 1} | Cluster #${id + 1}`)
                            .toJSON()
                    ]
                }));
            });
            const e = this.list.find(l => l.id === toStart[0]);
            this.startCluster(e.id, e.shards, e.firstShard, e.lastShard);
        });
    }
    get(id) {
        return this.workersById.get(id);
    }
    has(id) {
        return this.get(id) !== undefined;
    }
    startCluster(id, shards, shardStart, shardEnd) {
        const w = cluster_1.fork({
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
            .on("exit", (code, signal) => {
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
                    new core_1.EmbedBuilder("en")
                        .setTitle(`Cluster ${shutdown ? "Shutdown" : "Death"}`)
                        .setDescription(`Cluster #${id} has ${shutdown ? "been shutdown" : "died"}.`)
                        .setTimestamp(new Date().toISOString())
                        .setColor(core_1.Colors.red)
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
        logger_1.default.info("ClusterManager", `Launching cluster #${id} (shard${shards.length !== 1 ? "s" : ""} ${shardStart}-${shardEnd}, PID: ${w.process.pid})`);
        this.master.options.webhooks.filter(v => v.type === "cluster").forEach(v => this.master.eris.executeWebhook(v.id, v.token, {
            username: v.username,
            avatarURL: v.avatar,
            embeds: [
                new core_1.EmbedBuilder("en")
                    .setTitle("Cluster Launching")
                    .setDescription(`Cluster #${id} is launching with **${shards.length}** shard${shards.length !== 1 ? "s" : ""}.`)
                    .setTimestamp(new Date().toISOString())
                    .setColor(core_1.Colors.green)
                    .setFooter(`Cluster ${id + 1}/${this.list.length}`)
                    .toJSON()
            ]
        }));
    }
    restartCluster(id, force = false) {
        const c = this.get(id);
        const l = this.list.find(v => v.id === id);
        if (!c)
            throw new Error(`Unknown cluster "${id}".`);
        if (!l)
            throw new Error(`Unable to find information for the cluster ${id}.`);
        logger_1.default.warn("ServiceManager", `Restarting the cluster "${id}" (force: ${force ? "Yes" : "No"})`);
        if (force)
            c.kill("SIGKILL");
        else
            this.master.ipc.sendMessage("shutdown", force, `cluster.${id}`);
    }
    restartAllClusters(force = false) {
        this.shutdownClusterStep(this.list[0].id, force);
    }
    shutdownClusterStep(id, force = false) {
        this.master.ipc.sendMessage("shutdown", force, `cluster.${id}`);
        if (force)
            this.get(id).kill("SIGKILL");
        // restart done
        if (this.list[this.list.length - 1].id === id)
            return;
        this.master.ipc.once("clusterReady", () => this.shutdownClusterStep(id + 1, force));
    }
    shutdownCluster(id, force = false) {
        const c = this.get(id);
        const l = this.list.find(v => v.id === id);
        if (!c)
            throw new Error(`Unknown cluster "${id}".`);
        if (!l)
            throw new Error(`Unable to find information for the cluster ${id}.`);
        this.shutdown.push(id);
        logger_1.default.warn("ServiceManager", `Restarting the cluster "${id}" (force: ${force ? "Yes" : "No"})`);
        if (force)
            c.kill("SIGKILL");
        else
            this.master.ipc.sendMessage("shutdown", force, `cluster.${id}`);
    }
    shutdownAllClusters(force = false) {
        this.list.forEach(({ id }) => this.shutdownCluster(id, force));
    }
}
exports.default = ClusterManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2x1c3Rlck1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvY2x1c3Rlci9DbHVzdGVyTWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUVBLG9EQUE0QjtBQUM1QiwrQkFBNEM7QUFDNUMscUNBQXVDO0FBU3ZDLE1BQXFCLGNBQWM7SUFDbEMsTUFBTSxDQUFTO0lBQ2YsSUFBSSxDQUF3QjtJQUNwQixPQUFPLENBQVU7SUFDekIsT0FBTyxHQUFHLEVBQW1CLENBQUM7SUFDOUIsV0FBVyxHQUFHLElBQUksR0FBRyxFQUFrQixDQUFDO0lBQ2hDLE9BQU8sR0FBRyxLQUFLLENBQUM7SUFDaEIsVUFBVSxHQUFHLEtBQUssQ0FBQztJQUNuQixRQUFRLEdBQUcsRUFBbUIsQ0FBQztJQUN2QyxZQUFZLEdBQVksRUFBRSxNQUFjO1FBQ3ZDLElBQUksQ0FBQyxPQUFPLEdBQUcsR0FBRyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQ3RCLENBQUM7SUFFRCxLQUFLLENBQUMsS0FBSyxDQUFDLFFBQStCO1FBQzFDLE9BQU8sSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDNUMsSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLElBQUk7Z0JBQUUsTUFBTSxDQUFDLElBQUksU0FBUyxDQUFDLHFDQUFxQyxDQUFDLENBQUMsQ0FBQztZQUN4RixJQUFJLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQztZQUNyQixnQkFBTSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO1lBQ3ZELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3pDLElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7Z0JB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