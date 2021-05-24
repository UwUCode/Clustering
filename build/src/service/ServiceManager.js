"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("logger"));
const core_1 = require("core");
const cluster_1 = require("cluster");
class ServiceManager {
    master;
    list;
    workers = [];
    workersByName = new Map();
    started = false;
    shutdown = [];
    constructor(list, master) {
        this.list = list;
        this.master = master;
    }
    async start() {
        return new Promise((resolve, reject) => {
            if (this.started === true)
                reject(new TypeError("Services have already been started."));
            logger_1.default.info("ServiceManager", "Launching services...");
            const toStart = this.list.map(v => v.name);
            if (toStart.length === 0) {
                logger_1.default.info("ServiceManager", "No services to start.");
                return resolve();
            }
            this.master.ipc.on("serviceSetupDone", (data, messageId, { name }) => {
                logger_1.default.info("ServiceManager", `The service ${name} has finished launching.`);
                this.master.options.webhooks.filter(w => w.type === "service").forEach(w => this.master.eris.executeWebhook(w.id, w.token, {
                    username: w.username,
                    avatarURL: w.avatar,
                    embeds: [
                        new core_1.EmbedBuilder("en")
                            .setTitle("Service Ready")
                            .setDescription(`The service **${name}** is ready.`)
                            .setTimestamp(new Date().toISOString())
                            .setColor(core_1.Colors.green)
                            .setFooter(`Service: ${name}`)
                            .toJSON()
                    ]
                }));
                toStart.shift();
                if (toStart.length === 0) {
                    this.master.ipc.removeAllListeners("serviceSetupDone");
                    logger_1.default.info("ServiceManager", "Finished launching services.");
                    return resolve();
                }
                else
                    this.startService(toStart[0], this.getPath(toStart[0]));
            });
            this.startService(toStart[0], this.getPath(toStart[0]));
        });
    }
    get(name) {
        return this.workersByName.get(name);
    }
    has(name) {
        return this.get(name) !== undefined;
    }
    getPath(name) {
        return this.list.find(v => v.name === name)?.path;
    }
    startService(name, path) {
        const w = cluster_1.fork({
            TYPE: "SERVICE",
            NODE_ENV: process.env.NODE_ENV,
            NAME: name,
            JS_PATH: path
        });
        w
            .on("message", this.master.ipc.messageHandler.bind(this.master.ipc))
            .on("exit", (code, signal) => {
            console.log(`exit[service-${name}]`, code, signal);
            let shutdown = false;
            if (this.shutdown.includes(name)) {
                shutdown = true;
                this.shutdown.splice(this.shutdown.indexOf(name), 1);
            }
            this.master.options.webhooks.filter(v => v.type === "service").forEach(v => this.master.eris.executeWebhook(v.id, v.token, {
                username: v.username,
                avatarURL: v.avatar,
                embeds: [
                    new core_1.EmbedBuilder("en")
                        .setTitle(`Service ${shutdown ? "Shutdown" : "Death"}`)
                        .setDescription(`The service **${name}** has ${shutdown ? "been shutdown" : "died"}.`)
                        .setTimestamp(new Date().toISOString())
                        .setColor(core_1.Colors.red)
                        .setFooter(`Service: ${name} | Signal: ${signal}`)
                        .toJSON()
                ]
            }));
            this.startService(name, path);
        });
        this.workers.push(w);
        this.workersByName.set(name, w);
        logger_1.default.info("ServiceManager", `Launching the service ${name} (PID: ${w.process.pid}).`);
        this.master.options.webhooks.filter(v => v.type === "service").forEach(v => this.master.eris.executeWebhook(v.id, v.token, {
            username: v.username,
            avatarURL: v.avatar,
            embeds: [
                new core_1.EmbedBuilder("en")
                    .setTitle("Service Starting")
                    .setDescription(`The service **${name}** is starting.`)
                    .setTimestamp(new Date().toISOString())
                    .setColor(core_1.Colors.gold)
                    .setFooter(`Service: ${name}`)
                    .toJSON()
            ]
        }));
    }
    restartService(name, force = false) {
        const c = this.get(name);
        const l = this.list.find(v => v.name === name);
        if (!c)
            throw new Error(`Unknown service "${name}".`);
        if (!l)
            throw new Error(`Unable to find information for service ${name}.`);
        logger_1.default.warn("ServiceManager", `Restarting the service "${name}" (force: ${force ? "Yes" : "No"})`);
        if (force)
            c.kill("SIGKILL");
        else
            this.master.ipc.sendMessage("shutdown", force, `service.${name}`);
    }
    restartAllServices(force = false) {
        this.list.forEach(({ name }) => this.restartService(name, force));
    }
    shutdownService(name, force = false) {
        const c = this.get(name);
        const l = this.list.find(v => v.name === name);
        if (!c)
            throw new Error(`Unknown service "${name}".`);
        if (!l)
            throw new Error(`Unable to find information for service ${name}.`);
        this.shutdown.push(name);
        logger_1.default.warn("ServiceManager", `Restarting the service "${name}" (force: ${force ? "Yes" : "No"})`);
        if (force)
            c.kill("SIGKILL");
        else
            this.master.ipc.sendMessage("shutdown", force, `service.${name}`);
    }
    shutdownAllServices(force = false) {
        this.list.forEach(({ name }) => this.shutdownService(name, force));
    }
}
exports.default = ServiceManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VydmljZU1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmljZS9TZXJ2aWNlTWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUVBLG9EQUE0QjtBQUM1QiwrQkFBNEM7QUFDNUMscUNBQXVDO0FBY3ZDLE1BQXFCLGNBQWM7SUFDbEMsTUFBTSxDQUFTO0lBQ2YsSUFBSSxDQUF3QjtJQUM1QixPQUFPLEdBQUcsRUFBbUIsQ0FBQztJQUM5QixhQUFhLEdBQUcsSUFBSSxHQUFHLEVBQWtCLENBQUM7SUFDbEMsT0FBTyxHQUFHLEtBQUssQ0FBQztJQUNoQixRQUFRLEdBQUcsRUFBbUIsQ0FBQztJQUN2QyxZQUFZLElBQTJCLEVBQUUsTUFBYztRQUN0RCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztJQUN0QixDQUFDO0lBRUQsS0FBSyxDQUFDLEtBQUs7UUFDVixPQUFPLElBQUksT0FBTyxDQUFPLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQzVDLElBQUksSUFBSSxDQUFDLE9BQU8sS0FBSyxJQUFJO2dCQUFFLE1BQU0sQ0FBQyxJQUFJLFNBQVMsQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDLENBQUM7WUFDeEYsZ0JBQU0sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztZQUN2RCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMzQyxJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO2dCQUN6QixnQkFBTSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO2dCQUN2RCxPQUFPLE9BQU8sRUFBRSxDQUFDO2FBQ2pCO1lBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLGtCQUFrQixFQUFFLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUU7Z0JBQ3BFLGdCQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLGVBQWUsSUFBSSwwQkFBMEIsQ0FBQyxDQUFDO2dCQUM3RSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxTQUFTLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxFQUFFO29CQUMxSCxRQUFRLEVBQUUsQ0FBQyxDQUFDLFFBQVE7b0JBQ3BCLFNBQVMsRUFBRSxDQUFDLENBQUMsTUFBTTtvQkFDbkIsTUFBTSxFQUFFO3dCQUNQLElBQUksbUJBQVksQ0FBQyxJQUFJLENBQUM7NkJBQ3BCLFFBQVEsQ0FBQyxlQUFlLENBQUM7NkJBQ3pCLGNBQWMsQ0FBQyxpQkFBaUIsSUFBSSxjQUFjLENBQUM7NkJBQ25ELFlBQVksQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDOzZCQUN0QyxRQUFRLENBQUMsYUFBTSxDQUFDLEtBQUssQ0FBQzs2QkFDdEIsU0FBUyxDQUFDLFlBQVksSUFBSSxFQUFFLENBQUM7NkJBQzdCLE1BQU0sRUFBRTtxQkFDVjtpQkFDRCxDQUFDLENBQUMsQ0FBQztnQkFDSixPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ2hCLElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7b0JBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLGtCQUFrQixDQUFDLENBQUM7b0JBQ3ZELGdCQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLDhCQUE4QixDQUFDLENBQUM7b0JBQzlELE9BQU8sT0FBTyxFQUFFLENBQUM7aUJBQ2pCOztvQkFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBRSxDQUFDLENBQUM7WUFDakUsQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBRSxDQUFDLENBQUM7UUFDMUQsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsR0FBRyxDQUFDLElBQVk7UUFDZixPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFDRCxHQUFHLENBQUMsSUFBWTtRQUNmLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxTQUFTLENBQUM7SUFDckMsQ0FBQztJQUVELE9BQU8sQ0FBQyxJQUFZO1FBQ25CLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQztJQUNuRCxDQUFDO0lBRU8sWUFBWSxDQUFDLElBQVksRUFBRSxJQUFZO1FBQzlDLE1BQU0sQ0FBQyxHQUFHLGNBQUksQ0FBQztZQUNkLElBQUksRUFBRSxTQUFTO1lBQ2YsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUTtZQUM5QixJQUFJLEVBQUUsSUFBSTtZQUNWLE9BQU8sRUFBRSxJQUFJO1NBQ2IsQ0FBQyxDQUFDO1FBQ0gsQ0FBQzthQUNDLEVBQUUsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2FBQ25FLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDNUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsSUFBSSxHQUFHLEVBQUUsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ25ELElBQUksUUFBUSxHQUFHLEtBQUssQ0FBQztZQUNyQixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUNqQyxRQUFRLEdBQUcsSUFBSSxDQUFDO2dCQUNoQixJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQzthQUNyRDtZQUNELElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLEVBQUU7Z0JBQzFILFFBQVEsRUFBRSxDQUFDLENBQUMsUUFBUTtnQkFDcEIsU0FBUyxFQUFFLENBQUMsQ0FBQyxNQUFNO2dCQUNuQixNQUFNLEVBQUU7b0JBQ1AsSUFBSSxtQkFBWSxDQUFDLElBQUksQ0FBQzt5QkFDcEIsUUFBUSxDQUFDLFdBQVcsUUFBUSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO3lCQUN0RCxjQUFjLENBQUMsaUJBQWlCLElBQUksVUFBVSxRQUFRLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUM7eUJBQ3JGLFlBQVksQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO3lCQUN0QyxRQUFRLENBQUMsYUFBTSxDQUFDLEdBQUcsQ0FBQzt5QkFDcEIsU0FBUyxDQUFDLFlBQVksSUFBSSxjQUFjLE1BQU0sRUFBRSxDQUFDO3lCQUNqRCxNQUFNLEVBQUU7aUJBQ1Y7YUFDRCxDQUFDLENBQUMsQ0FBQztZQUNKLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQy9CLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2hDLGdCQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLHlCQUF5QixJQUFJLFVBQVUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO1FBQ3hGLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLEVBQUU7WUFDMUgsUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRO1lBQ3BCLFNBQVMsRUFBRSxDQUFDLENBQUMsTUFBTTtZQUNuQixNQUFNLEVBQUU7Z0JBQ1AsSUFBSSxtQkFBWSxDQUFDLElBQUksQ0FBQztxQkFDcEIsUUFBUSxDQUFDLGtCQUFrQixDQUFDO3FCQUM1QixjQUFjLENBQUMsaUJBQWlCLElBQUksaUJBQWlCLENBQUM7cUJBQ3RELFlBQVksQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO3FCQUN0QyxRQUFRLENBQUMsYUFBTSxDQUFDLElBQUksQ0FBQztxQkFDckIsU0FBUyxDQUFDLFlBQVksSUFBSSxFQUFFLENBQUM7cUJBQzdCLE1BQU0sRUFBRTthQUNWO1NBQ0QsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsY0FBYyxDQUFDLElBQVksRUFBRSxLQUFLLEdBQUcsS0FBSztRQUN6QyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3pCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsQ0FBQztRQUMvQyxJQUFJLENBQUMsQ0FBQztZQUFFLE1BQU0sSUFBSSxLQUFLLENBQUMsb0JBQW9CLElBQUksSUFBSSxDQUFDLENBQUM7UUFDdEQsSUFBSSxDQUFDLENBQUM7WUFBRSxNQUFNLElBQUksS0FBSyxDQUFDLDBDQUEwQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1FBQzNFLGdCQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLDJCQUEyQixJQUFJLGFBQWEsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7UUFDbkcsSUFBSSxLQUFLO1lBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQzs7WUFDeEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxLQUFLLEVBQUUsV0FBVyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFFRCxrQkFBa0IsQ0FBQyxLQUFLLEdBQUcsS0FBSztRQUMvQixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDbkUsQ0FBQztJQUVELGVBQWUsQ0FBQyxJQUFZLEVBQUUsS0FBSyxHQUFHLEtBQUs7UUFDMUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6QixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUM7UUFDL0MsSUFBSSxDQUFDLENBQUM7WUFBRSxNQUFNLElBQUksS0FBSyxDQUFDLG9CQUFvQixJQUFJLElBQUksQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxDQUFDO1lBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQywwQ0FBMEMsSUFBSSxHQUFHLENBQUMsQ0FBQztRQUMzRSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6QixnQkFBTSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSwyQkFBMkIsSUFBSSxhQUFhLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1FBQ25HLElBQUksS0FBSztZQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7O1lBQ3hCLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsS0FBSyxFQUFFLFdBQVcsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN4RSxDQUFDO0lBRUQsbUJBQW1CLENBQUMsS0FBSyxHQUFHLEtBQUs7UUFDaEMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ3BFLENBQUM7Q0FDRDtBQXZJRCxpQ0F1SUMifQ==