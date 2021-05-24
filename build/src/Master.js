"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
if (!("send" in process))
    process.env.TYPE = "MASTER";
const Constants_1 = require("./Constants");
const ServiceManager_1 = __importDefault(require("./service/ServiceManager"));
const ServiceBase_1 = __importDefault(require("./service/ServiceBase"));
const IPC_1 = __importDefault(require("./IPC"));
const IPCMaster_1 = __importDefault(require("./IPCMaster"));
const ClusterManager_1 = __importDefault(require("./cluster/ClusterManager"));
const Cluster_1 = __importDefault(require("./cluster/Cluster"));
const utilities_1 = require("utilities");
const tsee_1 = require("tsee");
const eris_1 = require("eris");
const logger_1 = __importDefault(require("logger"));
const cluster_1 = require("cluster");
const path_1 = __importDefault(require("path"));
class Manager extends tsee_1.EventEmitter {
    ipc;
    options;
    services;
    clusters;
    eris;
    statsPaused = true;
    launched = false;
    current;
    statsInterval;
    stats;
    constructor(opts) {
        super();
        this.ipc = new IPCMaster_1.default(this);
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
        if (this.options.pid)
            utilities_1.pid(`${this.options.pid}/${process.env.TYPE === "MASTER" ? "master" : process.env.TYPE === "CLUSTER" ? `cluster-${process.env.CLUSTER_ID}` : process.env.TYPE === "SERVICE" ? `service-${process.env.NAME}` : `unknown-${process.pid}`}.pid`);
        if (!path_1.default.isAbsolute(this.options.path))
            throw new Error("Provided path must be absolute.");
        (opts.services ?? []).forEach(service => {
            if (!path_1.default.isAbsolute(service.path))
                throw new Error(`Provided path for the service "${service.name}" must be absolute.`);
            const d = this.options.services.find(s => s.name === service.name);
            if (d)
                throw new Error(`Duplicate service name ${service.name} in file ${service.path}`);
            this.options.services.push(service);
        });
        this.eris = new eris_1.Client(`Bot ${this.options.token}`, {
            restMode: true
        });
        this.services = new ServiceManager_1.default(this.options.services, this);
        this.clusters = new ClusterManager_1.default(this.options, this);
    }
    async launch() {
        if (cluster_1.isMaster) {
            if (this.launched)
                throw new Error("Already launched.");
            this.launched = true;
            if (this.options.shardCount < 1) {
                const n = Date.now();
                const rec = await this.eris.getBotGateway();
                const d = new Date(n + rec.session_start_limit.reset_after);
                logger_1.default.debug("Manager", `Gateway recommends ${rec.shards} shard${rec.shards !== 1 ? "s" : ""}`);
                logger_1.default.debug("Manager", `Session usage: ${rec.session_start_limit.remaining}/${rec.session_start_limit.total} -- Reset: ${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`);
                this.options.shardCount = rec.shards;
            }
            if (this.options.clusterCount < 1)
                this.options.clusterCount = Math.ceil(this.options.shardCount / Constants_1.SHARDS_PER_CLUSTER);
            // easiest way I could think of
            const shards = Array.from(new Array(this.options.shardCount)).map((_, i) => i);
            const chunks = this.chunkShards(shards, this.options.clusterCount);
            logger_1.default.debug("Manager", `Using ${this.options.shardCount} shard${this.options.shardCount !== 1 ? "s" : ""} and ${this.options.clusterCount} cluster${this.options.clusterCount !== 1 ? "s" : ""}.`);
            // this resolves once all services have completed their setup (done has been called)
            await this.services.start();
            const ck = chunks.map((c, i) => ({
                id: i,
                shards: c,
                firstShard: c[0],
                lastShard: c[c.length - 1]
            }));
            await this.clusters.start(ck);
        }
        else {
            switch (process.env.TYPE) {
                case "CLUSTER": {
                    if (!process.env.JS_PATH)
                        throw new Error("[cluster] JS_PATH is missing in process environment variables");
                    if (!process.env.CLUSTER_ID)
                        throw new Error("[cluster] CLUSTER_ID is missing in process environment variables");
                    /* const c = */ this.current = new Cluster_1.default(Number(process.env.CLUSTER_ID), process.env.JS_PATH);
                    break;
                }
                case "SERVICE": {
                    if (!process.env.JS_PATH)
                        throw new Error("[service] JS_PATH is missing in process environment variables");
                    if (!process.env.NAME)
                        throw new Error("[service] NAME is missing in process environment variables");
                    let v = await Promise.resolve().then(() => __importStar(require(process.env.JS_PATH)));
                    if ("default" in v)
                        v = v.default;
                    // it's present, but not in typings(?)
                    if (!(v.prototype instanceof ServiceBase_1.default))
                        throw new Error(`Export in "${process.env.JS_PATH}" for service ${process.env.NAME} does not extend ServiceBase`);
                    /* const s = */ this.current = new v({
                        name: process.env.NAME,
                        ipc: new IPC_1.default()
                    });
                    break;
                }
                default: throw new Error(`Invalid process type "${process.env.TYPE}"`);
            }
        }
    }
    chunkShards(shards, clusters) {
        if (clusters < 2)
            return [shards];
        const length = shards.length;
        const r = [];
        let i = 0;
        let size;
        if (length % clusters === 0) {
            size = Math.floor(length / clusters);
            while (i < length) {
                r.push(shards.slice(i, (i += size)));
            }
        }
        else {
            while (i < length) {
                size = Math.ceil((length - i) / clusters--);
                r.push(shards.slice(i, (i += size)));
            }
        }
        return r;
    }
    startStats() {
        if (this.stats !== undefined)
            throw new TypeError("stats have already been started");
        this.stats = {
            memory: process.memoryUsage(),
            get combinedMemory() {
                const m = JSON.parse(JSON.stringify(this.memory));
                const l = [
                    ...this.clusters.map(v => v.memory),
                    ...this.services.map(v => v.memory)
                ];
                Object.keys(m).forEach(k => {
                    l.forEach((_, v) => m[k] += l[v][k]);
                });
                return m;
            },
            clusters: [],
            get shards() {
                return this.clusters.reduce((a, b) => a.concat(b.shards), []);
            },
            services: []
        };
        this.getStats();
        this.statsInterval = setInterval(this.getStats.bind(this), this.options.statsInterval);
    }
    stopStats() {
        if (this.stats === undefined)
            throw new TypeError("stats have not been started");
        this.stats = undefined;
        clearInterval(this.statsInterval);
    }
    getStats() {
        this.stats.memory = process.memoryUsage();
        this.services.workersByName.forEach((_, name) => this.ipc.sendMessage("getStats", null, `service.${name}`));
        this.clusters.workersById.forEach((_, id) => this.ipc.sendMessage("getStats", null, `cluster.${id}`));
    }
}
exports.default = Manager;
process
    .on("uncaughtException", (err) => logger_1.default.error("Uncaught Exception", err))
    .on("unhandledRejection", (err, p) => logger_1.default.error("Unhandled Rejection", err, p));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWFzdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL01hc3Rlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxJQUFJLENBQUMsQ0FBQyxNQUFNLElBQUksT0FBTyxDQUFDO0lBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsUUFBUSxDQUFDO0FBQ3RELDJDQUFpRDtBQUNqRCw4RUFBMEU7QUFDMUUsd0VBQThFO0FBQzlFLGdEQUFxQztBQUNyQyw0REFBMkQ7QUFDM0QsOEVBQXNEO0FBQ3RELGdFQUF3QztBQUN4Qyx5Q0FBMkQ7QUFDM0QsK0JBQXFEO0FBQ3JELCtCQUFzRTtBQUN0RSxvREFBNEI7QUFDNUIscUNBQW1DO0FBQ25DLGdEQUF3QjtBQW9EeEIsTUFBcUIsT0FBUSxTQUFRLG1CQUFZO0lBQ2hELEdBQUcsQ0FBOEI7SUFDakMsT0FBTyxDQUErRjtJQUN0RyxRQUFRLENBQWlCO0lBQ3pCLFFBQVEsQ0FBaUI7SUFDekIsSUFBSSxDQUFTO0lBQ2IsV0FBVyxHQUFHLElBQUksQ0FBQztJQUNYLFFBQVEsR0FBRyxLQUFLLENBQUM7SUFDakIsT0FBTyxDQUF3QjtJQUMvQixhQUFhLENBQWlCO0lBQ3RDLEtBQUssQ0FBUztJQUNkLFlBQVksSUFBNEM7UUFDdkQsS0FBSyxFQUFFLENBQUM7UUFDUixJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksbUJBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMvQixJQUFJLENBQUMsT0FBTyxHQUFHO1lBQ2QsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO1lBQ2YsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1lBQ2pCLFVBQVUsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksSUFBSSxDQUFDLFVBQVUsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVU7WUFDaEYsWUFB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