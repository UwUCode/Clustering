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
const Base_1 = __importDefault(require("./Base"));
const IPC_1 = __importDefault(require("../IPC"));
const eris_1 = __importDefault(require("eris"));
const perf_hooks_1 = require("perf_hooks");
class Cluster {
    ipc;
    id;
    path;
    class;
    client;
    options;
    shards;
    shardStart;
    shardEnd;
    constructor(id, path) {
        this.ipc = new IPC_1.default();
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
            .on("evalAtCluster", async (data, messageId, from) => {
            const start = parseFloat(perf_hooks_1.performance.now().toFixed(3));
            let res, error = false;
            try {
                // eslint-disable-next-line no-eval
                res = await eval(data);
            }
            catch (e) {
                error = true;
                res = e;
            }
            const end = parseFloat(perf_hooks_1.performance.now().toFixed(3));
            this.ipc.sendMessage(messageId, { time: { start, end, total: parseFloat((end - start).toFixed(3)) }, result: { error, data: res } }, from);
        })
            .sendMessage("clusterStart", null, "master");
    }
    async start() {
        let v = await Promise.resolve().then(() => __importStar(require(process.env.JS_PATH)));
        if ("default" in v)
            v = v.default;
        // it's present, but not in typings(?)
        if (!(v.prototype instanceof Base_1.default))
            throw new Error(`Export in "${process.env.JS_PATH}" does not extend Base`);
        this.class = new v({
            cluster: this
        });
        const e = this.client = new eris_1.default.Client(`Bot ${this.options.token}`, {
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
exports.default = Cluster;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2x1c3Rlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9jbHVzdGVyL0NsdXN0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsa0RBQWlEO0FBQ2pELGlEQUFzQztBQUV0QyxnREFBd0I7QUFFeEIsMkNBQXlDO0FBZXpDLE1BQXFCLE9BQU87SUFDM0IsR0FBRyxDQUE0QjtJQUMvQixFQUFFLENBQVM7SUFDWCxJQUFJLENBQVM7SUFDYixLQUFLLENBQU87SUFDWixNQUFNLENBQWM7SUFDcEIsT0FBTyxDQUFVO0lBQ2pCLE1BQU0sQ0FBZ0I7SUFDdEIsVUFBVSxDQUFTO0lBQ25CLFFBQVEsQ0FBUztJQUNqQixZQUFZLEVBQVUsRUFBRSxJQUFZO1FBQ25DLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxhQUFHLEVBQUUsQ0FBQztRQUNyQixJQUFJLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQztRQUNiLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxHQUFHO2FBQ04sRUFBRSxDQUFDLGNBQWMsRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRTtZQUNqRSxJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztZQUN2QixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztZQUNyQixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztZQUM3QixJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztZQUN6QixLQUFLLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNuQixDQUFDLENBQUM7YUFDRCxFQUFFLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRTtZQUNuRCxFQUFFLEVBQUUsSUFBSSxD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