/// <reference types="node" />
import { Emitted } from "../IPC";
import Master from "../Master";
import { Worker } from "cluster";
export interface ServiceDefaultEvents {
    "serviceCommand": Emitted<{
        responsive: boolean;
        cmdData: unknown;
        id: string;
    }, "cluster" | "master">;
    "getStats": Emitted<null, "master">;
    "evalAtService": Emitted<string, "master">;
    "shutdown": Emitted<boolean, "master">;
}
export interface ServiceCreator {
    name: string;
    path: string;
}
export default class ServiceManager {
    master: Master;
    list: Array<ServiceCreator>;
    workers: Worker[];
    workersByName: Map<string, Worker>;
    private started;
    private shutdown;
    constructor(list: Array<ServiceCreator>, master: Master);
    start(): Promise<void>;
    get(name: string): Worker | undefined;
    has(name: string): boolean;
    getPath(name: string): string | undefined;
    private startService;
    restartService(name: string, force?: boolean): void;
    restartAllServices(force?: boolean): void;
    shutdownService(name: string, force?: boolean): void;
    shutdownAllServices(force?: boolean): void;
}
