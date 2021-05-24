"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const perf_hooks_1 = require("perf_hooks");
class ServiceBase {
    ipc;
    name;
    processedCommands = 0;
    constructor({ ipc, name }) {
        this.ipc = ipc;
        this.name = name;
        this.ipc
            .on("serviceCommand", async (data, messageId, from) => {
            this.processedCommands++;
            if (data.responsive === false)
                void this.handleCommand(data.cmdData, from);
            else {
                void this.handleCommand(data.cmdData, from)
                    .then(res => this.ipc.sendMessage(messageId, res, from === "master" ? "master" : `cluster.${from.id}`))
                    .catch(err => this.ipc.sendMessage(messageId, err, from === "master" ? "master" : `cluster.${from.id}`));
            }
        })
            .on("getStats", () => this.ipc.sendMessage("stats", {
            name: this.name,
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            processedCommands: this.processedCommands
        }))
            .on("evalAtService", async (data, messageId, from) => {
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
            .on("shutdown", () => {
            this.shutdown(() => {
                process.kill(process.pid, "SIGTERM");
            });
        })
            .sendMessage("serviceStart", null, "master");
    }
    get [Symbol.toStringTag]() {
        return `Service[${this.name}]`;
    }
    toString() {
        return `[Service ${this.name}]`;
    }
    done() {
        this.ipc.sendMessage("serviceSetupDone", null, "master");
    }
}
exports.default = ServiceBase;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VydmljZUJhc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmljZS9TZXJ2aWNlQmFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUdBLDJDQUF5QztBQVF6QyxNQUE4QixXQUFXO0lBQ3hDLEdBQUcsQ0FBNEI7SUFDL0IsSUFBSSxDQUFTO0lBQ0gsaUJBQWlCLEdBQUcsQ0FBQyxDQUFDO0lBQ2hDLFlBQVksRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFxQjtRQUMzQyxJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxHQUFHO2FBQ04sRUFBRSxDQUFDLGdCQUFnQixFQUFFLEtBQUssRUFBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxFQUFFO1lBQ3BELElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3pCLElBQUksSUFBSSxDQUFDLFVBQVUsS0FBSyxLQUFLO2dCQUFFLEtBQUssSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO2lCQUN0RTtnQkFDSixLQUFLLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUM7cUJBQ3pDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUNYLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUUsSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxXQUFXLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUN6RjtxQkFDQSxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FDWixJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFLElBQUksS0FBSyxRQUFRLENBQUMs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