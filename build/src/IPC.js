"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Constants_1 = require("./Constants");
const tsee_1 = require("tsee");
const logger_1 = __importDefault(require("logger"));
const crypto_1 = __importDefault(require("crypto"));
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- I don't care
class IPC extends tsee_1.EventEmitter {
    static generateRandomId() {
        return crypto_1.default.randomBytes(16).toString("hex");
    }
    get generateRandomId() {
        return IPC.generateRandomId.bind(IPC);
    }
    cb = new Map();
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
    sendMessage(op, data = null, to) {
        // distinguish between nothing and delibrate undefined
        // eslint-disable-next-line prefer-rest-params
        // if (data === undefined && !Object.prototype.hasOwnProperty.call(arguments, "1")) data = null;
        if (!("send" in process))
            throw new Error("process#send is not present.");
        const id = IPC.generateRandomId();
        const [type, value] = to?.split(".") ?? [];
        if (Constants_1.DEBUG)
            logger_1.default.debug(`IPC#sendMessage[${process.env.TYPE ?? "UNKNOWN"}]`, "Sending ipc message to", to ?? "master", "op:", op, "data:", data);
        process.send({
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
        });
        return id;
    }
    async serviceCommand(service, data, responsive = false) {
        return new Promise((resolve, reject) => {
            const id = this.sendMessage("serviceCommand", { responsive, cmdData: data }, `service.${service}`);
            if (!responsive)
                return resolve();
            else {
                const t = setTimeout(() => reject(new Error("Response timed out.")), 1.5e4);
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- I can't make definitions for all of the possible ids
                // @ts-ignore
                this.once(id, (d) => {
                    clearTimeout(t);
                    resolve(d);
                });
            }
        });
    }
    messageHandler(message) {
        const { op, data, messageId, from, to } = typeof message === "string" ? JSON.parse(message) : message;
        if (Constants_1.DEBUG)
            logger_1.default.debug(`IPC#messageHandler[${process.env.TYPE ?? "UNKNOWN"}]`, "Recieved ipc message from", from, "op:", op, "data:", data, "to:", to);
        if (process.env.TYPE === "MASTER" && to && to !== "master") {
            if (to.type === "cluster")
                this.sendMessage(op, data, `cluster.${to.id}`);
            else if (to.type === "service")
                this.sendMessage(op, data, `service.${to.name}`);
            else
                throw new Error(`Invalid "to.type" recieved: ${to.type}`);
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
        }
        else
            this.emit(op, data, messageId, from);
    }
    async getStats() {
        return new Promise((resolve, reject) => {
            const id = this.sendMessage("fetchStats", null, "master");
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- I can't make definitions for all of the possible ids
            // @ts-ignore
            this.once(id, ((data) => {
                clearInterval(t);
                if (data === null)
                    return reject(new Error("stats are either not enabled, or they have not been processed yet"));
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
    async evalAtCluster(id, code, args) {
        code = this.parse(code, args);
        return new Promise((resolve, reject) => {
            const msgId = this.sendMessage("evalAtCluster", { id, code }, "master");
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- I can't make definitions for all of the possible ids
            // @ts-ignore
            this.once(msgId, ((data) => {
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
    async evalAtService(name, code, args) {
        code = this.parse(code, args);
        return new Promise((resolve, reject) => {
            const msgId = this.sendMessage("evalAtService", { name, code }, "master");
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- I can't make definitions for all of the possible ids
            // @ts-ignore
            this.once(msgId, ((data) => {
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
    async broadcastClusterEval(code, args) {
        code = this.parse(code, args);
        return new Promise((resolve, reject) => {
            const msgId = this.sendMessage("broadcastClusterEval", code, "master");
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- I can't make definitions for all of the possible ids
            // @ts-ignore
            this.once(msgId, ((data) => {
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
    async broadcastServiceEval(code, args) {
        code = this.parse(code, args);
        return new Promise((resolve, reject) => {
            const msgId = this.sendMessage("broadcastServiceEval", code, "master");
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- I can't make definitions for all of the possible ids
            // @ts-ignore
            this.once(msgId, ((data) => {
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
    async broadcastEval(code, args) {
        const clusters = await this.broadcastClusterEval(code, args);
        const services = await this.broadcastServiceEval(code, args);
        return {
            clusters,
            services
        };
    }
    parse(d, args) {
        if (!args)
            args = {};
        if (typeof d === "string")
            return d;
        if (typeof d === "function")
            d = d.toString();
        // this doesn't work that well so I removed it
        // function def(m) { return m.default ?? m; };${Object.entries(this.modules).map(([key, value]) => `const ${key} = def(require("${value}"))`).join(";")};
        return `(async()=>{const args = JSON.parse(\`${JSON.stringify(args)}\`);${d.slice(d.indexOf("{") + 1, d.lastIndexOf("}")).trim()}})()`;
    }
    /**
     * Restart a singular cluster
     *
     * @param {number} id - The id of the cluster to restart
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
     */
    restartCluster(id, force = false) {
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
    shutdownCluster(id, force = false) {
        this.sendMessage("shutdownCluster", { id, force }, "master");
    }
    /**
     * start a cluster
     *
     * @param {number} id - The id of the cluster to start
     */
    startCluster(id) {
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
    restartService(name, force = false) {
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
    shutdownService(name, force = false) {
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
exports.default = IPC;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSVBDLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL0lQQy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUVBLDJDQUF5RDtBQUd6RCwrQkFBb0M7QUFDcEMsb0RBQTRCO0FBQzVCLG9EQUE0QjtBQXNENUIsNkRBQTZEO0FBQzdELDZCQUE2QjtBQUM3QixNQUFxQixHQUFxRCxTQUFRLG1CQUFnRTtJQUNqSixNQUFNLENBQUMsZ0JBQWdCO1FBQ3RCLE9BQU8sZ0JBQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQy9DLENBQUM7SUFDRCxJQUFJLGdCQUFnQjtRQUNuQixPQUFPLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDdkMsQ0FBQztJQUNTLEVBQUUsR0FBRyxJQUFJLEdBQUcsRUFBMkUsQ0FBQztJQUNsRztRQUNDLEtBQUssRUFBRSxDQUFDO1FBQ1IsT0FBTyxDQUFDLEVBQUUsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ0gsV0FBVyxDQUFDLEVBQVUsRUFBRSxPQUFnQixJQUFJLEVBQUUsRUFBeUQ7UUFDdEcsc0RBQXNEO1FBQ3RELDhDQUE4QztRQUM5QyxnR0FBZ0c7UUFDaEcsSUFBSSxDQUFDLENBQUMsTUFBTSxJQUFJLE9BQU8sQ0FBQztZQUFFLE1BQU0sSUFBSSxLQUFLLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUMxRSxNQUFNLEVBQUUsR0FBRyxHQUFHLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUNsQyxNQUFNLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzNDLElBQUksaUJBQUs7WUFB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