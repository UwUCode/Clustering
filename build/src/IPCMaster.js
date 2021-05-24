"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// I can't make definitions for all of the possible ids and such
const IPC_1 = __importDefault(require("./IPC"));
const Constants_1 = require("./Constants");
const logger_1 = __importDefault(require("logger"));
const perf_hooks_1 = require("perf_hooks");
class IPCMaster extends IPC_1.default {
    master;
    active = true;
    constructor(master) {
        super();
        if (process.env.TYPE === "MASTER") {
            this.master = master;
            this
                .on("stats", ((data, messageId, from) => {
                switch (from.type) {
                    case "cluster":
                        this.master.stats.clusters.push(data);
                        break;
                    case "service":
                        this.master.stats.services.push(data);
                        break;
                    default: throw new TypeError("invalid stats type recieved");
                }
            }))
                .on("fetchStats", ((data, messageId, from) => {
                this.sendMessage(messageId, this.master.stats === undefined ? null : JSON.parse(JSON.stringify(this.master.stats)), from.type === "cluster" ? `${from.type}.${from.id}` : `${from.type}.${from.name}`);
            }))
                .on("evalAtMaster", (async (data, messageId, from) => {
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
                this.sendMessage(messageId, {
                    time: {
                        start,
                        end,
                        total: parseFloat((end - start).toFixed(3))
                    },
                    result: {
                        error,
                        data: res
                    },
                    code: Constants_1.EVAL_RESPONSE_CODES.OK
                }, from.type === "cluster" ? `${from.type}.${from.id}` : `${from.type}.${from.name}`);
            }))
                .on("evalAtCluster", (async ({ id, code }, messageId, from) => {
                const msgId = this.sendMessage("evalAtCluster", code, `cluster.${id}`);
                // @ts-ignore
                this.once(msgId, (data) => {
                    this.sendMessage(messageId, data, from.type === "cluster" ? `${from.type}.${from.id}` : `${from.type}.${from.name}`);
                });
            }))
                .on("evalAtService", (async ({ name, code }, messageId, from) => {
                const msgId = this.sendMessage("evalAtService", code, `service.${name}`);
                // @ts-ignore
                this.once(msgId, (data) => {
                    this.sendMessage(messageId, data, from.type === "cluster" ? `${from.type}.${from.id}` : `${from.type}.${from.name}`);
                });
            }))
                .on("broadcastClusterEval", (async (data, messageId, from) => {
                const res = [];
                await Promise.all(this.master.clusters.list.map((v) => new Promise((resolve) => {
                    const id = this.sendMessage("evalAtCluster", data, `cluster.${v.id}`);
                    this.once(id, ((d) => {
                        d.clusterId = v.id;
                        res[v.id] = d;
                        clearTimeout(t);
                        resolve();
                    }));
                    const t = setTimeout(() => {
                        this.removeAllListeners(id);
                        res[v.id] = {
                            clusterId: v.id,
                            time: null,
                            result: null,
                            code: Constants_1.EVAL_RESPONSE_CODES.TIMEOUT
                        };
                        resolve();
                    }, 1.5e4);
                })));
                this.sendMessage(messageId, res, from.type === "cluster" ? `${from.type}.${from.id}` : `${from.type}.${from.name}`);
            }))
                .on("broadcastServiceEval", (async (data, messageId, from) => {
                const res = {};
                await Promise.all(this.master.services.list.map((v) => new Promise((resolve) => {
                    const id = this.sendMessage("evalAtService", data, `service.${v.name}`);
                    this.once(id, ((d) => {
                        d.serviceName = v.name;
                        res[v.name] = d;
                        clearTimeout(t);
                        resolve();
                    }));
                    const t = setTimeout(() => {
                        this.removeAllListeners(id);
                        res[v.name] = {
                            serviceName: v.name,
                            time: null,
                            result: null,
                            code: Constants_1.EVAL_RESPONSE_CODES.TIMEOUT
                        };
                        resolve();
                    }, 1.5e4);
                })));
                this.sendMessage(messageId, res, from.type === "cluster" ? `${from.type}.${from.id}` : `${from.type}.${from.name}`);
            }))
                .on("restartCluster", (({ id, force }) => this.restartCluster(id, force)))
                .on("restartAllClusters", (({ force }) => this.restartAllClusters(force)))
                .on("shutdownCluster", (({ id, force }) => this.shutdownCluster(id, force)))
                .on("startCluster", (({ id }) => this.startCluster(id)))
                .on("shutdownAllClusters", (({ force }) => this.shutdownAllClusters(force)))
                .on("restartService", (({ name, force }) => this.restartService(name, force)))
                .on("restartAllServices", (({ force }) => this.restartAllServices(force)))
                .on("shutdownService", (({ name, force }) => this.shutdownService(name, force)))
                .on("shutdownAllServices", (({ force }) => this.shutdownAllServices(force)));
        }
        else
            this.active = false;
    }
    /**
     * Send a message to a different process
     *
     * @param {string} op - The op code for the reciever
     * @param {unknown} data - The data to send
     * @param {(`cluster.${number}` | `service.${string}`)} to - The service or cluster to send the message to.
     */
    sendMessage(op, data, to) {
        if (process.env.TYPE !== "MASTER")
            throw new Error(`IPCMaster used from non-MASTER process (${process.env.TYPE ?? "UNKNOWN"})`);
        const id = IPC_1.default.generateRandomId();
        const [type, value] = to.split(".") ?? [];
        if (Constants_1.DEBUG)
            logger_1.default.debug(`IPC#sendMessage[${process.env.TYPE ?? "UNKNOWN"}]`, "Sending ipc message to", to ?? "master", "op:", op, "data:", data);
        switch (type) {
            case "cluster": {
                const c = this.master.clusters.get(Number(value));
                if (!c)
                    throw new Error(`Unknown cluster #${value}`);
                c.send({
                    op,
                    data,
                    messageId: id,
                    from: "master"
                });
                break;
            }
            case "service": {
                const s = this.master.services.get(value);
                if (!s)
                    throw new Error(`Unknown service "${value}"`);
                s.send({
                    op,
                    data,
                    messageId: id,
                    from: "master"
                });
                break;
            }
        }
        return id;
    }
    messageHandler(message) {
        return super.messageHandler.call(this, message);
    }
    /**
     * Restart a singular cluster
     *
     * @param {number} id - The id of the cluster to restart
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully restarting
     */
    restartCluster(id, force = false) {
        this.master.clusters.restartCluster(id, force);
    }
    /**
     * Restart all clusters
     *
     * @param {boolean} [force=false] - If we should just kill the processes instead of gracefully restarting
     */
    restartAllClusters(force = false) {
        this.master.clusters.restartAllClusters(force);
    }
    /**
     * Shutdown a singular cluster
     *
     * @param {number} id - The id of the cluster to shutdown
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
     */
    shutdownCluster(id, force = false) {
        this.master.clusters.shutdownCluster(id, force);
    }
    /**
     * start a cluster
     *
     * @param {number} id - The id of the cluster to start
     */
    startCluster(id) {
        const l = this.master.clusters.list.find(v => v.id === id);
        this.master.clusters.startCluster(id, l.shards, l.firstShard, l.lastShard);
    }
    /**
     * Shutdown all clusters
     *
     * @param {boolean} [force=false] - If we should just kill the processes instead of gracefully shutting down
     */
    shutdownAllClusters(force = false) {
        this.master.clusters.shutdownAllClusters(force);
    }
    /**
     * Restart a singular service
     *
     * @param {string} name - The name of the service to restart
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully restarting
     */
    restartService(name, force = false) {
        this.master.services.restartService(name, force);
    }
    /**
     * Restart all services
     *
     * @param {boolean} [force=false] - If we should just kill the processes instead of gracefully restarting
     */
    restartAllServices(force = false) {
        this.master.services.restartAllServices(force);
    }
    /**
     * Shutdown a singular service
     *
     * @param {string} name - The name of the service to shutdown
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
     */
    shutdownService(name, force = false) {
        this.master.services.shutdownService(name, force);
    }
    /**
     * Shutdown all services
     *
     * @param {boolean} [force=false] - If we should just kill the processes instead of gracefully shutting down
     */
    shutdownAllServices(force = false) {
        this.master.services.shutdownAllServices(force);
    }
    /**
     * Shutdown all clusters & services
     *
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
     */
    totalShutdown(force = false) {
        if (force)
            return process.kill(process.pid, "SIGKILL");
        this.master.clusters.restartAllClusters(force);
        this.master.services.restartAllServices(force);
        // I can't be bothered with doing checks 'n' stuff, so
        // we just wait 15 seconds and exit with SIGTERM/15
        setTimeout(() => {
            process.kill(process.pid, "SIGTERM");
        }, 1.5e4);
    }
}
exports.default = IPCMaster;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSVBDTWFzdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL0lQQ01hc3Rlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFBLDBGQUEwRjtBQUMxRixnRUFBZ0U7QUFDaEUsZ0RBQWlHO0FBRWpHLDJDQUF5RDtBQUV6RCxvREFBNEI7QUFFNUIsMkNBQXlDO0FBd0N6QyxNQUFxQixTQUF1RCxTQUFRLGFBQU07SUFDekYsTUFBTSxDQUFTO0lBQ2YsTUFBTSxHQUFHLElBQUksQ0FBQztJQUNkLFlBQVksTUFBYztRQUN6QixLQUFLLEVBQUUsQ0FBQztRQUNSLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFO1lBQ2xDLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1lBQ3JCLElBQUk7aUJBQ0YsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsSUFBaUMsRUFBRSxTQUFpQixFQUFFLElBQXlDLEVBQUUsRUFBRTtnQkFDakgsUUFBUSxJQUFJLENBQUMsSUFBSSxFQUFFO29CQUNsQixLQUFLLFNBQVM7d0JBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFvQixDQUFDLENBQUM7d0JBQUMsTUFBTTtvQkFDOUUsS0FBSyxTQUFTO3dCQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBb0IsQ0FBQyxDQUFDO3dCQUFDLE1BQU07b0JBQzlFLE9BQU8sQ0FBQyxDQUFDLE1BQU0sSUFBSSxTQUFTLENBQUMsNkJBQTZCLENBQUMsQ0FBQztpQkFDNUQ7WUFDRixDQUFDLENBQVEsQ0FBQztpQkFDVCxFQUFFLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxJQUFVLEVBQUUsU0FBaUIsRUFBRSxJQUF5QyxFQUFFLEVBQUU7Z0JBQy9GLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLElB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